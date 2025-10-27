import { queueService, QueueJob } from '../src/services/queue.service';
import { submissionService } from '../src/services/submission.service';
import { ESubmissionStatus } from '../src/enums/ESubmissionStatus';
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
    console.log(`Processing job for submission ${job.submissionId}`);

    try {
      const { submissionId, code, language, testcases, timeLimit, memoryLimit } = job;

      // Update submission status to RUNNING
      await submissionService.updateSubmissionStatus(submissionId, ESubmissionStatus.RUNNING);

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

      // Calculate final status
      const finalStatus = this.determineFinalStatus(
        executionResult.summary,
        executionResult.results
      );

      // Calculate score
      const score = this.calculateScore(executionResult.results, testcases);

      // Update submission with results
      await submissionService.updateSubmissionResult(submissionId, {
        status: finalStatus as any,
        score,
        result: executionResult,
      });

      this.totalProcessed++;
      console.log(`✅ Job for submission ${job.submissionId} completed successfully`);
    } catch (error: any) {
      console.error(`❌ Job for submission ${job.submissionId} failed:`, error.message);

      // Update submission with error status
      await submissionService.updateSubmissionStatus(
        job.submissionId,
        ESubmissionStatus.RUNTIME_ERROR
      );

      this.totalErrors++;
    }
  }

  private determineFinalStatus(summary: any, results: any[]): string {
    if (summary.passed === summary.total) {
      return ESubmissionStatus.ACCEPTED;
    }

    // Check for specific error types
    for (const result of results) {
      if (result.error) {
        if (result.error.includes('timeout') || result.error.includes('Time limit exceeded')) {
          return ESubmissionStatus.TIME_LIMIT_EXCEEDED;
        }
        if (result.error.includes('memory') || result.error.includes('Memory limit exceeded')) {
          return ESubmissionStatus.MEMORY_LIMIT_EXCEEDED;
        }
        if (result.error.includes('compilation') || result.error.includes('Compilation failed')) {
          return ESubmissionStatus.COMPILATION_ERROR;
        }
        return ESubmissionStatus.RUNTIME_ERROR;
      }
    }

    return ESubmissionStatus.WRONG_ANSWER;
  }

  private calculateScore(results: any[], testcases: any[]): number {
    let totalScore = 0;
    let maxScore = 0;

    results.forEach((result, index) => {
      const testcase = testcases[index];
      if (testcase) {
        maxScore += testcase.point;
        if (result.ok) {
          totalScore += testcase.point;
        }
      }
    });

    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  }

  /**
   * Test sandbox service availability
   */
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
