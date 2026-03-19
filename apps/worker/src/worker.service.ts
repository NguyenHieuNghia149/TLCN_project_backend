import {
  JudgeUtils,
  logger,
  buildFunctionExecutionSource,
  normalizeRuntimeSignature,
  NormalizerError,
} from '@backend/shared/utils';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { queueService, QueueJob } from '@backend/api/services/queue.service';
import { submissionService } from '@backend/api/services/submission.service';
import { ExamService } from '@backend/api/services/exam.service';
import { EProblemJudgeMode, ESubmissionStatus } from '@backend/shared/types';
import { sandboxGrpcClient, GrpcExecutionRequest } from './grpc/client';
import { createSandboxBreaker, SandboxBreaker } from './grpc/circuit-breaker';
import { generateWrapper } from './services/wrapperGenerator';

type ExecutionMode = 'wrapper' | 'legacy';

type PreparedExecutionPayload = {
  sourceCode: string;
  executionMode: ExecutionMode;
  testcases: Array<{ id: string; input: string; output: string; point: number }>;
};

export class WorkerService {
  private workerId: string;
  private totalProcessed: number = 0;
  private totalErrors: number = 0;
  private legacyFallbackCount: number = 0;
  private worker: Worker | null = null;
  private breaker: SandboxBreaker | null = null;
  private examFinalizerInterval: NodeJS.Timeout | null = null;

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
        if (job) {
          const failureReason = (err as any)?.failureReason as string | undefined;
          const normalizerCode = (err as any)?.normalizerCode as string | undefined;

          logger.error(
            `Job ${job.id} failed (Attempt ${job.attemptsMade}/${job.opts.attempts}):`,
            err.message
          );

          if (failureReason) {
            logger.error(`Job ${job.id} failed with reason=${failureReason}${normalizerCode ? ` code=${normalizerCode}` : ''}`);
          }

          this.totalErrors++;

          const queueJob = job.data as QueueJob;
          const maxAttempts = job.opts.attempts || 3;
          const shouldFinalizeFailure =
            failureReason === 'signature_validation' || job.attemptsMade >= maxAttempts;

          if (shouldFinalizeFailure) {
            logger.error(`Job ${job.id} exhausted all attempts or hit a non-retryable error. Setting to SYSTEM_ERROR.`);

            try {
              if (queueJob.jobType !== 'RUN_CODE') {
                await submissionService.updateSubmissionResult(queueJob.submissionId, {
                  status: ESubmissionStatus.SYSTEM_ERROR,
                  score: 0,
                  result: {
                    passed: 0,
                    total: queueJob.testcases.length,
                    results: [],
                  },
                });
              }

              const message =
                failureReason === 'signature_validation'
                  ? `System error during execution (Invalid function signature metadata: ${normalizerCode || 'unknown'})`
                  : 'System error during execution (Max retries exceeded)';

              await queueService.publish(
                'submission_updates',
                JSON.stringify({
                  submissionId: queueJob.submissionId,
                  data: {
                    submissionId: queueJob.submissionId,
                    status: ESubmissionStatus.SYSTEM_ERROR,
                    message,
                    failureReason,
                  },
                })
              );
            } catch (failErr) {
              logger.error('Fail to handle dead letter update mapping:', failErr);
            }
          }
        } else {
          logger.error('Worker global error:', err.message);
        }
      });

      logger.info(`Worker ${this.workerId} started seamlessly`);

      this.examFinalizerInterval = setInterval(async () => {
        try {
          const examService = new ExamService();
          const finalized = await examService.finalizeExpiredParticipations();
          if (finalized > 0) {
            logger.info(`Auto-finalized ${finalized} expired exam participations`);
          }
        } catch (err) {
          logger.error('Error running exam finalizer:', err);
        }
      }, 10000);
    } catch (error) {
      logger.error('Failed to start worker:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info(`Stopping worker ${this.workerId}...`);
    if (this.examFinalizerInterval) {
      clearInterval(this.examFinalizerInterval);
    }
    if (this.worker) {
      await this.worker.close();
      logger.info('Worker closed gracefully.');
    }
  }

  private isStructuredInput(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private resolveStructuredTestcaseInput(testcase: QueueJob['testcases'][number]): Record<string, unknown> {
    if (this.isStructuredInput(testcase.inputJson)) {
      return testcase.inputJson;
    }

    if (typeof testcase.input === 'string' && testcase.input.trim().length > 0) {
      try {
        const parsed = JSON.parse(testcase.input);
        if (this.isStructuredInput(parsed)) {
          return parsed;
        }
      } catch (error) {
        logger.warn(`Failed to parse legacy structured input for testcase ${testcase.id}: ${String(error)}`);
      }
    }

    throw new Error(`Function-signature testcase ${testcase.id} is missing structured input data`);
  }

  private buildLegacyFunctionPayload(job: QueueJob): PreparedExecutionPayload {
    this.legacyFallbackCount++;
    logger.warn(`job ${job.submissionId} has no inputJson; falling back to legacy buildFunctionExecutionSource`);

    const testcaseInputs = job.testcases.map(testcase => this.resolveStructuredTestcaseInput(testcase));

    const sourceCode = buildFunctionExecutionSource({
      language: job.language as 'cpp' | 'java' | 'python',
      userSource: job.code,
      signature: job.functionSignature as any,
      testcases: testcaseInputs,
    });

    return {
      sourceCode,
      executionMode: 'legacy',
      testcases: job.testcases.map((testcase, index) => ({
        id: testcase.id,
        input: testcase.executionInput ?? String(index),
        output: testcase.output,
        point: testcase.point,
      })),
    };
  }

  private prepareExecutionPayload(job: QueueJob): PreparedExecutionPayload {
    const judgeMode = job.judgeMode ?? EProblemJudgeMode.STDIN_STDOUT;

    if (judgeMode !== EProblemJudgeMode.FUNCTION_SIGNATURE) {
      return {
        sourceCode: job.code,
        executionMode: 'legacy',
        testcases: job.testcases.map(testcase => ({
          id: testcase.id,
          input: testcase.executionInput ?? testcase.input,
          output: testcase.output,
          point: testcase.point,
        })),
      };
    }

    if (!job.functionSignature) {
      throw new Error('Function-signature job is missing functionSignature metadata');
    }

    const requestedExecutionMode = job.executionMode;
    const hasStructuredInputs = job.testcases.every(testcase => this.isStructuredInput(testcase.inputJson));

    if (requestedExecutionMode === 'wrapper' && !hasStructuredInputs) {
      throw new Error(
        `Function-signature job ${job.submissionId} requested wrapper mode but testcase inputJson is missing`
      );
    }

    if (requestedExecutionMode === 'legacy') {
      return this.buildLegacyFunctionPayload(job);
    }

    if (!hasStructuredInputs) {
      return this.buildLegacyFunctionPayload(job);
    }

    const normalizedSignature = normalizeRuntimeSignature(job.functionSignature);
    const sourceCode = generateWrapper(
      job.language as 'cpp' | 'java' | 'python',
      normalizedSignature,
      job.code
    );

    return {
      sourceCode,
      executionMode: 'wrapper',
      testcases: job.testcases.map(testcase => ({
        id: testcase.id,
        input: JSON.stringify(testcase.inputJson),
        output: testcase.output,
        point: testcase.point,
      })),
    };
  }

  private remapExecutionResults(job: QueueJob, executionResult: any): any {
    const testcaseMeta = new Map(
      job.testcases.map(testcase => [
        testcase.id,
        {
          input: testcase.input,
          output: testcase.output,
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

  private async processJob(bullJob: Job): Promise<void> {
    const job = bullJob.data as QueueJob;

    logger.info(
      `Processing job for submission ${job.submissionId} (Type: ${job.jobType || 'SUBMISSION'})`
    );

    try {
      const { submissionId, language, testcases, timeLimit, memoryLimit, jobType } = job;
      const isRunOnly = jobType === 'RUN_CODE';
      const executionPayload = this.prepareExecutionPayload(job);

      await queueService.publish(
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
          executionMode: executionPayload.executionMode,
        })
      );

      const finalStatus = JudgeUtils.determineFinalStatus(
        executionResult.summary,
        executionResult.results
      );
      const score = JudgeUtils.calculateScore(executionResult.results, testcases);

      if (!isRunOnly) {
        await submissionService.updateSubmissionResult(submissionId, {
          status: finalStatus as any,
          score,
          result: executionResult,
        });
      }

      await queueService.publish(
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
    } catch (error) {
      if (error instanceof NormalizerError) {
        bullJob.discard();
        const wrappedError = new Error(`Function signature validation failed: ${error.message}`);
        wrappedError.name = 'WorkerSignatureValidationError';
        (wrappedError as any).failureReason = 'signature_validation';
        (wrappedError as any).normalizerCode = error.code;
        throw wrappedError;
      }

      throw error;
    }
  }

  private async testSandboxService(): Promise<boolean> {
    try {
      const probe: GrpcExecutionRequest = {
        submission_id: 'health-probe',
        source_code: 'print(1)',
        language: 'python',
        time_limit_ms: 5000,
        memory_limit_kb: 65536,
        execution_mode: 'legacy',
        test_cases: [{ id: 'probe', input: '', expected_output: '1' }],
      };
      await sandboxGrpcClient.executeCode(probe);
      return true;
    } catch (error) {
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
      execution_mode: (config.executionMode || 'legacy') as ExecutionMode,
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

  private mapGrpcResponseToLegacy(grpcResponse: any): any {
    if (!grpcResponse || grpcResponse.overall_status === 'SYSTEM_ERROR') {
      throw new Error('Sandbox system error - circuit breaker fallback activated');
    }

    const results = (grpcResponse.results || []).map((r: any) => {
      const maxLength = 2048;
      let actualOutput = r.actual_output || '';
      let errorMessage = r.error_message || null;

      if (actualOutput.length > maxLength) {
        actualOutput = actualOutput.substring(0, maxLength) + '\n... [TRUNCATED]';
      }

      if (errorMessage && errorMessage.length > maxLength) {
        errorMessage = errorMessage.substring(0, maxLength) + '\n... [TRUNCATED]';
      }

      return {
        testcaseId: r.test_case_id,
        input: '',
        expectedOutput: '',
        actualOutput,
        isPassed: r.status === 'ACCEPTED',
        executionTime: r.time_taken_ms,
        memoryUse: r.memory_used_kb,
        error: errorMessage,
        stderr: errorMessage,
      };
    });

    const passed = results.filter((result: any) => result.isPassed).length;

    return {
      summary: {
        passed,
        total: results.length,
        successRate: results.length > 0 ? ((passed / results.length) * 100).toFixed(2) : '0.00',
        status: grpcResponse.overall_status,
      },
      results,
      compileError: grpcResponse.compile_error || null,
    };
  }

  getStats() {
    return {
      workerId: this.workerId,
      totalProcessed: this.totalProcessed,
      totalErrors: this.totalErrors,
      legacyFallbackCount: this.legacyFallbackCount,
      sandboxGrpcUrl: process.env.SANDBOX_GRPC_URL || 'localhost:50051',
      circuitBreakerOpen: this.breaker ? this.breaker.opened : false,
    };
  }
}

export const workerService = new WorkerService();



