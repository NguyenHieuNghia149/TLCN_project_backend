import { queueService, QueueJob } from '@backend/api/src/services/queue.service';
import { submissionService } from '@backend/api/src//services/submission.service';
import { ExamService } from '@backend/api/src//services/exam.service';
import { ESubmissionStatus } from '@backend/shared/types';
import { JudgeUtils } from '@backend/shared/utils';
import axios from 'axios';

export class WorkerService {
  private isRunning: boolean = false;
  private workerId: string;
  private totalProcessed: number = 0;
  private totalErrors: number = 0;
  private sandboxUrl: string;

  constructor() {
    this.workerId = `worker-${Date.now()}`;
    this.sandboxUrl = process.env.SANDBOX_URL || 'http://localhost:4000';
  }

  async start(): Promise<void> {
    console.log(`Starting Code Execution Worker: ${this.workerId}`);

    try {
      // Connect to Redis
      await queueService.connect();
      console.log(`Connected to Redis queue`);

      // Test sandbox service availability
      const sandboxAvailable = await this.testSandboxService();
      if (!sandboxAvailable) {
        console.error('❌ Sandbox service is not available!');
        console.log(`Please ensure sandbox service is running at ${this.sandboxUrl}`);
        process.exit(1);
      }

      this.isRunning = true;
      console.log(`Worker ${this.workerId} started successfully`);

      // Exam finalizer frequency control
      let lastFinalize = 0;

      // Main processing loop
      while (this.isRunning) {
        try {
          const job = await queueService.getJob();
          if (job) {
            await this.processJob(job);
          } else {
            // No jobs available, wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error('Error in worker loop:', error);
          this.totalErrors++;
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
        }

        // Periodically finalize expired exam participations (every 10 seconds)
        try {
          const now = Date.now();
          if (now - lastFinalize > 10000) {
            lastFinalize = now;
            const examService = new ExamService();
            const finalized = await examService.finalizeExpiredParticipations();
            if (finalized > 0) {
              console.log(`Auto-finalized ${finalized} expired exam participations`);
            }
          }
        } catch (err) {
          console.error('Error running exam finalizer:', err);
        }
      }
    } catch (error) {
      console.error('Failed to start worker:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    console.log(`Stopping worker ${this.workerId}...`);
    this.isRunning = false;
  }

  private async processJob(job: QueueJob): Promise<void> {
    console.log(
      `Processing job for submission ${job.submissionId} (Type: ${job.jobType || 'SUBMISSION'})`
    );

    try {
      const { submissionId, code, language, testcases, timeLimit, memoryLimit, jobType } = job;
      const isRunOnly = jobType === 'RUN_CODE';

      // Update submission status to RUNNING (only if not ephemeral)
      if (!isRunOnly) {
        await submissionService.updateSubmissionStatus(submissionId, ESubmissionStatus.RUNNING);
      } else {
        // Run code notify running
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
      }

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

      // Create a map of testcaseId -> isPublic for quick lookup
      const testcaseMap = new Map(testcases.map(tc => [tc.id, tc.isPublic ?? false]));

      // Add isPublic to each result in the execution result
      if (executionResult.results && Array.isArray(executionResult.results)) {
        executionResult.results = executionResult.results.map((result: any) => ({
          ...result,
          isPublic: testcaseMap.get(result.testcaseId) ?? false,
        }));
      }

      // Calculate final status
      const finalStatus = JudgeUtils.determineFinalStatus(
        executionResult.summary,
        executionResult.results
      );

      // Calculate score
      const score = JudgeUtils.calculateScore(executionResult.results, testcases);

      if (!isRunOnly) {
        // Update submission with results
        await submissionService.updateSubmissionResult(submissionId, {
          status: finalStatus as any,
          score,
          result: executionResult,
        });
      }

      // Publish update to Redis for WebSocket service
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
      console.log(`✅ Job for submission ${job.submissionId} completed successfully`);
    } catch (error: any) {
      console.error(`❌ Job for submission ${job.submissionId} failed:`, error.message);

      if (job.jobType !== 'RUN_CODE') {
        // Update submission with error status
        await submissionService.updateSubmissionStatus(
          job.submissionId,
          ESubmissionStatus.RUNTIME_ERROR
        );
      } else {
        // Notify error for ephemeral run
        await queueService.publish(
          'submission_updates',
          JSON.stringify({
            submissionId: job.submissionId,
            data: {
              submissionId: job.submissionId,
              status: ESubmissionStatus.RUNTIME_ERROR,
              message: error.message,
            },
          })
        );
      }

      this.totalErrors++;
    }
  }

  private async testSandboxService(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.sandboxUrl}/health`, { timeout: 5000 });
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      console.error('Sandbox service health check failed:', error);
      return false;
    }
  }

  /**
   * Execute code in sandbox service
   */
  private async executeInSandbox(config: any): Promise<any> {
    try {
      const response = await axios.post(`${this.sandboxUrl}/api/sandbox/execute`, config, {
        timeout: 60000, // 60 seconds timeout
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Sandbox execution failed');
      }
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Sandbox service error: ${error.response.data.message || error.message}`);
      } else if (error.request) {
        throw new Error('Sandbox service is not responding');
      } else {
        throw new Error(`Sandbox execution error: ${error.message}`);
      }
    }
  }

  getStats(): {
    workerId: string;
    isRunning: boolean;
    totalProcessed: number;
    totalErrors: number;
    sandboxUrl: string;
  } {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      totalProcessed: this.totalProcessed,
      totalErrors: this.totalErrors,
      sandboxUrl: this.sandboxUrl,
    };
  }
}

// Singleton instance
export const workerService = new WorkerService();
