import { JudgeUtils, logger } from '@backend/shared/utils';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { queueService, QueueJob } from '@backend/api/src/services/queue.service';
import { submissionService } from '@backend/api/src/services/submission.service';
import { ExamService } from '@backend/api/src/services/exam.service';
import { ESubmissionStatus } from '@backend/shared/types';
import { sandboxGrpcClient, GrpcExecutionRequest } from './grpc/client';
import { createSandboxBreaker, SandboxBreaker } from './grpc/circuit-breaker';

export class WorkerService {
  private workerId: string;
  private totalProcessed: number = 0;
  private totalErrors: number = 0;
  private worker: Worker | null = null;
  private breaker: SandboxBreaker | null = null;
  private examFinalizerInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.workerId = `worker-${Date.now()}`;
  }

  async start(): Promise<void> {
    logger.info(`Starting Code Execution Worker: ${this.workerId}`);

    try {
      // Connect publisher queueService if needed (it auto connects but ensuring health check logic could be here)

      // Test sandbox service availability (non-fatal - sandbox may start after worker)
      const sandboxAvailable = await this.testSandboxService();
      if (!sandboxAvailable) {
        logger.warn(
          'Sandbox service is not yet available. Worker will retry when processing jobs.'
        );
        logger.warn(`Sandbox gRPC URL: ${process.env.SANDBOX_GRPC_URL || 'localhost:50051'}`);
      }

      // 1. Initialize BullMQ Worker (Task 2.1 & 2.2)
      const queueRedisUrl =
        process.env.REDIS_QUEUE_URL || process.env.REDIS_URL || 'redis://localhost:6379/1';
      const connection = new Redis(queueRedisUrl, { maxRetriesPerRequest: null });

      this.worker = new Worker(
        'judge_queue',
        async (job: Job) => {
          await this.processJob(job.data as QueueJob);
        },
        {
          connection: connection as any,
          concurrency: 5,
          lockDuration: 30000,
          stalledInterval: 15000,
        }
      );

      // Task 3.4: Initialize Circuit Breaker AFTER worker is created
      // so it can bind pause/resume to the BullMQ Worker instance.
      this.breaker = createSandboxBreaker(this.worker);

      this.worker.on('completed', (job: Job) => {
        logger.info(`Job ${job.id} completed successfully`);
      });

      // 2. Dead Letter & Failing handling (Task 2.5)
      this.worker.on('failed', async (job: Job | undefined, err: Error) => {
        if (job) {
          logger.error(
            `Job ${job.id} failed (Attempt ${job.attemptsMade}/${job.opts.attempts}):`,
            err.message
          );
          this.totalErrors++;

          if (job.attemptsMade >= (job.opts.attempts || 3)) {
            logger.error(`Job ${job.id} exhausted all attempts. Setting to SYSTEM_ERROR.`);
            const queueJob = job.data as QueueJob;

            // Failsafe status update
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

              await queueService.publish(
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
              logger.error('Fail to handle dead letter update mapping:', failErr);
            }
          }
        } else {
          logger.error('Worker global error:', err.message);
        }
      });

      logger.info(`Worker ${this.workerId} started seamlessly`);

      // 3. Periodically finalize expired exam participations
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

  // Graceful shutdown (Task 2.4)
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

  private async processJob(job: QueueJob): Promise<void> {
    logger.info(
      `Processing job for submission ${job.submissionId} (Type: ${job.jobType || 'SUBMISSION'})`
    );

    const { submissionId, code, language, testcases, timeLimit, memoryLimit, jobType } = job;
    const isRunOnly = jobType === 'RUN_CODE';

    // Rule: Stop writing the RUNNING status to PostgreSQL. (Task 2.3)
    // Only publish RUNNING via PubSub for SSE (Virtual View)
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

    // Execute code using sandbox service
    const executionResult = await this.executeInSandbox({
      code,
      language,
      testcases: testcases.map(tc => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        point: tc.point,
      })),
      timeLimit,
      memoryLimit,
    });

    const testcaseMap = new Map(testcases.map(tc => [tc.id, tc.isPublic ?? false]));

    if (executionResult.results && Array.isArray(executionResult.results)) {
      executionResult.results = executionResult.results.map((result: any) => ({
        ...result,
        isPublic: testcaseMap.get(result.testcaseId) ?? false,
      }));
    }

    const finalStatus = JudgeUtils.determineFinalStatus(
      executionResult.summary,
      executionResult.results
    );
    const score = JudgeUtils.calculateScore(executionResult.results, testcases);

    if (!isRunOnly) {
      // Idempotent update through submissionService
      await submissionService.updateSubmissionResult(submissionId, {
        status: finalStatus as any,
        score,
        result: executionResult,
      });
    }

    // Publish terminal update to Redis for SSE
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
  }

  private async testSandboxService(): Promise<boolean> {
    try {
      // Probe via gRPC: send a minimal dummy request and check for non-UNAVAILABLE status
      const probe: GrpcExecutionRequest = {
        submission_id: 'health-probe',
        source_code: 'print(1)',
        language: 'python',
        time_limit_ms: 5000,
        memory_limit_kb: 65536,
        test_cases: [{ id: 'probe', input: '', expected_output: '1' }],
      };
      await sandboxGrpcClient.executeCode(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute code in sandbox via gRPC + Circuit Breaker (Task 3.3 & 3.4)
   */
  private async executeInSandbox(config: any): Promise<any> {
    const request: GrpcExecutionRequest = {
      submission_id: config.submissionId || 'unknown',
      source_code: config.code,
      language: config.language,
      time_limit_ms: config.timeLimit || 5000,
      memory_limit_kb: config.memoryLimit ? parseInt(config.memoryLimit) * 1024 : 262144, // default 256 MB
      test_cases: (config.testcases || []).map((tc: any) => ({
        id: tc.id,
        input: tc.input || '',
        expected_output: tc.output || '',
      })),
    };

    if (!this.breaker) {
      // Breaker not yet initialized (should not happen) — call directly
      const grpcResponse = await sandboxGrpcClient.executeCode(request);
      return this.mapGrpcResponseToLegacy(grpcResponse);
    }

    const grpcResponse = await (this.breaker.fire(request) as Promise<any>);
    return this.mapGrpcResponseToLegacy(grpcResponse);
  }

  /**
   * Map gRPC ExecutionResponse → legacy sandbox result format expected by JudgeUtils
   */
  private mapGrpcResponseToLegacy(grpcResponse: any): any {
    if (!grpcResponse || grpcResponse.overall_status === 'SYSTEM_ERROR') {
      throw new Error('Sandbox system error — circuit breaker fallback activated');
    }

    const results = (grpcResponse.results || []).map((r: any) => ({
      testcaseId: r.test_case_id,
      input: '',
      expectedOutput: '',
      actualOutput: r.actual_output,
      isPassed: r.status === 'ACCEPTED',
      executionTime: r.time_taken_ms,
      memoryUse: r.memory_used_kb,
      error: r.error_message || null,
      stderr: r.error_message || null,
    }));

    const passed = results.filter((r: any) => r.isPassed).length;

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
      sandboxGrpcUrl: process.env.SANDBOX_GRPC_URL || 'localhost:50051',
      circuitBreakerOpen: this.breaker ? this.breaker.opened : false,
    };
  }
}

// Singleton instance
export const workerService = new WorkerService();
