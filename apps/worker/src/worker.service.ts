import {
  JudgeUtils,
  buildTestcaseDisplay,
  canonicalizeStructuredValue,
  logger,
} from '@backend/shared/utils';
import { ESubmissionStatus } from '@backend/shared/types';
import { SubmissionResult } from '@backend/shared/validations/submission.validation';
import {
  finalizeSubmissionResult,
  judgeQueueService,
  QueueJob,
} from '@backend/shared/runtime';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { sandboxGrpcClient, GrpcExecutionRequest } from './grpc/client';
import { createSandboxBreaker, SandboxBreaker } from './grpc/circuit-breaker';
import { generateWrapper } from './services/wrapperGenerator';

type PreparedExecutionPayload = {
  sourceCode: string;
  testcases: Array<{ id: string; input: string; output: string; point: number }>;
};

export class WorkerService {
  private workerId: string;
  private totalProcessed: number = 0;
  private totalErrors: number = 0;
  private worker: Worker | null = null;
  private breaker: SandboxBreaker | null = null;

  constructor() {
    this.workerId = `worker-${Date.now()}`;
  }

  async start(): Promise<void> {
    logger.info(`Starting Code Execution Worker: ${this.workerId}`);

    try {
      const sandboxAvailable = await this.testSandboxService();
      if (!sandboxAvailable) {
        logger.warn('Sandbox service is not yet available. Worker will retry when processing jobs.');
        logger.warn(`Sandbox gRPC URL: ${process.env.SANDBOX_GRPC_URL || 'localhost:50051'}`);
      }

      const queueRedisUrl =
        process.env.REDIS_QUEUE_URL || process.env.REDIS_URL || 'redis://localhost:6379/1';
      const connection = new Redis(queueRedisUrl, { maxRetriesPerRequest: null });

      this.worker = new Worker(
        'judge_queue',
        async (bullJob: Job) => {
          await this.processJob(bullJob);
        },
        {
          connection: connection as any,
          concurrency: 5,
          lockDuration: 30000,
          stalledInterval: 15000,
        }
      );

      this.breaker = createSandboxBreaker(this.worker);

      this.worker.on('completed', (job: Job) => {
        logger.info(`Job ${job.id} completed successfully`);
      });

      this.worker.on('failed', async (job: Job | undefined, err: Error) => {
        if (!job) {
          logger.error('Worker global error:', err.message);
          return;
        }

        logger.error(
          `Job ${job.id} failed (Attempt ${job.attemptsMade}/${job.opts.attempts}):`,
          err.message
        );

        this.totalErrors++;

        const queueJob = job.data as QueueJob;
        const maxAttempts = job.opts.attempts || 3;

        if (job.attemptsMade >= maxAttempts) {
          logger.error(
            `Job ${job.id} exhausted all attempts. Setting submission to SYSTEM_ERROR.`
          );

          try {
            if (queueJob.jobType !== 'RUN_CODE') {
              await this.finalizeSubmission(queueJob.submissionId, {
                status: ESubmissionStatus.SYSTEM_ERROR,
                result: {
                  passed: 0,
                  total: queueJob.testcases.length,
                  results: [],
                },
              });
            }

            await judgeQueueService.publish(
              'submission_updates',
              JSON.stringify({
                submissionId: queueJob.submissionId,
                data: {
                  submissionId: queueJob.submissionId,
                  status: ESubmissionStatus.SYSTEM_ERROR,
                  message: 'System error during execution (Max retries exceeded)',
                },
              })
            );
          } catch (failErr) {
            logger.error('Failed to finalize SYSTEM_ERROR after job exhaustion', failErr);
          }
        }
      });

      logger.info(`Worker ${this.workerId} started seamlessly`);
    } catch (error) {
      logger.error('Failed to start worker:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info(`Stopping worker ${this.workerId}...`);
    if (this.worker) {
      await this.worker.close();
      logger.info('Worker closed gracefully.');
    }
  }

  private isStructuredInput(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private prepareExecutionPayload(job: QueueJob): PreparedExecutionPayload {
    const missingStructuredInput = job.testcases.find(
      testcase => !this.isStructuredInput(testcase.inputJson)
    );
    if (missingStructuredInput) {
      throw new Error(
        `Queue job ${job.submissionId} is missing structured inputJson for testcase ${missingStructuredInput.id}`
      );
    }

    const sourceCode = generateWrapper(
      job.language as 'cpp' | 'java' | 'python',
      job.functionSignature as any,
      job.code
    );

    return {
      sourceCode,
      testcases: job.testcases.map(testcase => ({
        id: testcase.id,
        input: JSON.stringify(testcase.inputJson),
        output: canonicalizeStructuredValue(testcase.outputJson),
        point: testcase.point,
      })),
    };
  }

  private remapExecutionResults(job: QueueJob, executionResult: any): any {
    const testcaseMeta = new Map(
      job.testcases.map(testcase => [
        testcase.id,
        {
          ...buildTestcaseDisplay(job.functionSignature, testcase),
          isPublic: testcase.isPublic ?? false,
        },
      ])
    );

    if (executionResult.results && Array.isArray(executionResult.results)) {
      executionResult.results = executionResult.results.map((result: any) => {
        const testcase = testcaseMeta.get(result.testcaseId);
        return {
          ...result,
          input: testcase?.input ?? result.input,
          expectedOutput: testcase?.output ?? result.expectedOutput,
          isPublic: testcase?.isPublic ?? false,
        };
      });
    }

    return executionResult;
  }

  private async finalizeSubmission(
    submissionId: string,
    data: {
      status: ESubmissionStatus;
      result: SubmissionResult;
      judgedAt?: string;
    }
  ): Promise<void> {
    const submission = await finalizeSubmissionResult({
      submissionId,
      status: data.status,
      result: data.result,
      judgedAt: data.judgedAt,
    });

    if (!submission) {
      logger.warn(
        `[Idempotency] Submission ${submissionId} already in terminal state. Ignoring retry.`
      );
    }
  }

  private async processJob(bullJob: Job): Promise<void> {
    const job = bullJob.data as QueueJob;

    logger.info(
      `Processing job for submission ${job.submissionId} (Type: ${job.jobType || 'SUBMISSION'})`
    );

    const { submissionId, language, testcases, timeLimit, memoryLimit, jobType } = job;
    const isRunOnly = jobType === 'RUN_CODE';
    const executionPayload = this.prepareExecutionPayload(job);

    await judgeQueueService.publish(
      'submission_updates',
      JSON.stringify({
        submissionId,
        data: {
          submissionId,
          status: ESubmissionStatus.RUNNING,
          message: 'Compiling and Running...',
        },
      })
    );

    const executionResult = this.remapExecutionResults(
      job,
      await this.executeInSandbox({
        submissionId,
        code: executionPayload.sourceCode,
        language,
        testcases: executionPayload.testcases,
        timeLimit,
        memoryLimit,
      })
    );

    const finalStatus = JudgeUtils.determineFinalStatus(
      executionResult.summary,
      executionResult.results
    );
    const score = JudgeUtils.calculateScore(executionResult.results, testcases);

    if (!isRunOnly) {
      await this.finalizeSubmission(submissionId, {
        status: finalStatus as ESubmissionStatus,
        result: executionResult,
      });
    }

    await judgeQueueService.publish(
      'submission_updates',
      JSON.stringify({
        submissionId,
        data: {
          submissionId,
          status: finalStatus,
          result: executionResult,
          score,
          isRunOnly,
        },
      })
    );

    this.totalProcessed++;
  }

  private async testSandboxService(): Promise<boolean> {
    try {
      const probe: GrpcExecutionRequest = {
        submission_id: 'health-probe',
        source_code:
          'import json\nimport sys\nif __name__ == "__main__":\n    sys.stdout.write(json.dumps({"actual_output": 1, "time_taken_ms": 0}))',
        language: 'python',
        time_limit_ms: 5000,
        memory_limit_kb: 65536,
        test_cases: [{ id: 'probe', input: '{}', expected_output: '1' }],
      };
      await sandboxGrpcClient.executeCode(probe);
      return true;
    } catch {
      return false;
    }
  }

  private async executeInSandbox(config: any): Promise<any> {
    const request: GrpcExecutionRequest = {
      submission_id: config.submissionId || 'unknown',
      source_code: config.code,
      language: config.language,
      time_limit_ms: config.timeLimit || 5000,
      memory_limit_kb: config.memoryLimit ? parseInt(config.memoryLimit) * 1024 : 262144,
      test_cases: (config.testcases || []).map((tc: any) => ({
        id: tc.id,
        input: tc.input || '',
        expected_output: tc.output || '',
      })),
    };

    if (!this.breaker) {
      const grpcResponse = await sandboxGrpcClient.executeCode(request);
      return this.mapGrpcResponseToLegacy(grpcResponse);
    }

    const grpcResponse = await (this.breaker.fire(request) as Promise<any>);
    return this.mapGrpcResponseToLegacy(grpcResponse);
  }

  private buildFallbackErrorMessage(status: string, compileError: string): string {
    switch (status) {
      case 'TIME_LIMIT_EXCEEDED':
        return 'Time limit exceeded';
      case 'MEMORY_LIMIT_EXCEEDED':
        return 'Memory limit exceeded';
      case 'COMPILATION_ERROR':
        return compileError || 'Compilation failed';
      case 'RUNTIME_ERROR':
        return 'Runtime error';
      case 'WRONG_ANSWER':
        return 'Wrong Answer';
      default:
        return compileError || 'Sandbox execution failed';
    }
  }

  private mapGrpcResponseToLegacy(grpcResponse: any): any {
    if (!grpcResponse) {
      throw new Error('Sandbox returned an empty response');
    }

    if (grpcResponse.overall_status === 'SYSTEM_ERROR') {
      throw new Error(grpcResponse.compile_error || 'Sandbox system error');
    }

    const compileError = grpcResponse.compile_error || '';
    let results = (grpcResponse.results || []).map((r: any) => {
      const maxLength = 2048;
      let actualOutput = r.actual_output || '';
      let errorMessage = r.error_message || '';

      if (actualOutput.length > maxLength) {
        actualOutput = actualOutput.substring(0, maxLength) + '\n... [TRUNCATED]';
      }

      if (errorMessage.length > maxLength) {
        errorMessage = errorMessage.substring(0, maxLength) + '\n... [TRUNCATED]';
      }

      const status = String(r.status || 'WRONG_ANSWER');
      const normalizedError =
        status === 'ACCEPTED'
          ? null
          : errorMessage || this.buildFallbackErrorMessage(status, compileError);

      return {
        testcaseId: r.test_case_id,
        input: '',
        expectedOutput: '',
        actualOutput,
        isPassed: status === 'ACCEPTED',
        executionTime: r.time_taken_ms,
        memoryUse: r.memory_used_kb,
        error: normalizedError,
        stderr: normalizedError,
      };
    });

    if (results.length === 0 && compileError) {
      results = [
        {
          testcaseId: 'compile-error',
          input: '',
          expectedOutput: '',
          actualOutput: '',
          isPassed: false,
          executionTime: 0,
          memoryUse: null,
          error: compileError,
          stderr: compileError,
        },
      ];
    }

    const passed = results.filter((result: any) => result.isPassed).length;
    const total = results.length;

    return {
      summary: {
        passed,
        total,
        successRate: total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00',
        status: grpcResponse.overall_status,
      },
      results,
      compileError: compileError || null,
    };
  }

  getStats() {
    return {
      workerId: this.workerId,
      totalProcessed: this.totalProcessed,
      totalErrors: this.totalErrors,
      sandboxGrpcUrl: process.env.SANDBOX_GRPC_URL || 'localhost:50051',
      circuitBreakerOpen: this.breaker ? this.breaker.opened : false,
    };
  }
}

export const workerService = new WorkerService();

