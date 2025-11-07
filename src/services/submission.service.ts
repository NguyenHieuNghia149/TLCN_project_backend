import { ESubmissionStatus } from '@/enums/ESubmissionStatus';
import { queueService, QueueJob } from './queue.service';
import { codeExecutionService } from './code-execution.service';
import { WebSocketService } from './websocket.service';
import {
  CreateSubmissionInput,
  SubmissionStatus,
  SubmissionResult,
} from '@/validations/submission.validation';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResultSubmissionRepository } from '@/repositories/result-submission.repository';
import { TestcaseRepository } from '@/repositories/testcase.repository';
import { ProblemRepository } from '@/repositories/problem.repository';
import { SubmissionEntity, ResultSubmissionEntity, TestcaseEntity } from '@/database/schema';
import { PaginationOptions } from '@/repositories/base.repository';
import axios from 'axios';
import { BaseException } from '@/exceptions/auth.exceptions';

export interface SubmissionInput {
  sourceCode: string;
  language: string;
  problemId: string;
  userId: string;
}

export class SubmissionService {
  private submissionRepository: SubmissionRepository;
  private resultSubmissionRepository: ResultSubmissionRepository;
  private testcaseRepository: TestcaseRepository;
  private problemRepository: ProblemRepository;

  constructor() {
    this.submissionRepository = new SubmissionRepository();
    this.resultSubmissionRepository = new ResultSubmissionRepository();
    this.testcaseRepository = new TestcaseRepository();
    this.problemRepository = new ProblemRepository();
  }

  async submitCode(input: CreateSubmissionInput & { userId: string }): Promise<{
    submissionId: string;
    status: ESubmissionStatus;
    queuePosition: number;
    estimatedWaitTime: number;
  }> {
    // Validate problem exists
    const problem = await this.problemRepository.findById(input.problemId);
    if (!problem) {
      throw new Error('Problem not found');
    }

    // Get testcases for the problem
    const testcases = await this.testcaseRepository.findByProblemId(input.problemId);
    if (testcases.length === 0) {
      throw new Error('No testcases found for this problem');
    }

    // Create submission record
    const submission = await this.submissionRepository.create({
      sourceCode: input.sourceCode,
      language: input.language,
      problemId: input.problemId,
      userId: input.userId,
      status: ESubmissionStatus.PENDING,
    });

    // Get queue position
    const queueLength = await queueService.getQueueLength();
    const estimatedWaitTime = queueLength * 30; // Estimate 30 seconds per job

    // Create job for queue
    const job: QueueJob = {
      submissionId: submission.id,
      userId: input.userId,
      problemId: input.problemId,
      code: input.sourceCode,
      language: input.language,
      testcases: testcases.map(tc => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        point: tc.point,
      })),
      timeLimit: problem.timeLimit || 1000, // Default 1 second
      memoryLimit: problem.memoryLimit || '128m', // Default 128MB
      createdAt: new Date().toISOString(),
    };

    // Add job to queue
    await queueService.addJob(job);

    // TODO: Emit WebSocket event when WebSocketService is properly implemented
    // emitSubmissionQueued({
    //   submissionId: submission.id,
    //   status: ESubmissionStatus.PENDING,
    //   queuePosition: queueLength + 1,
    //   problemId: input.problemId,
    //   language: input.language,
    // });

    return {
      submissionId: submission.id,
      status: ESubmissionStatus.PENDING,
      queuePosition: queueLength + 1,
      estimatedWaitTime,
    };
  }

  async runCode(
    input: CreateSubmissionInput & { userId?: string },
    options?: { authHeader?: string }
  ) {
    // Validate problem exists
    const problem = await this.problemRepository.findById(input.problemId);
    if (!problem) {
      throw new BaseException('Problem not found');
    }

    // Get testcases for the problem
    const testcases = await this.testcaseRepository.findByProblemId(input.problemId);
    if (testcases.length === 0) {
      throw new BaseException('No testcases found for this problem');
    }

    // Build execution config expected by sandbox
    const execConfig = {
      code: input.sourceCode,
      language: input.language,
      testcases: testcases.map(tc => ({ id: tc.id, input: tc.input, output: tc.output })),
      timeLimit: problem.timeLimit || 1000,
      memoryLimit: problem.memoryLimit || '128m',
    } as any;

    // Call remote sandbox HTTP API instead of direct import to support separate sandbox service
    // Prefer SANDBOX_URL (set in docker-compose as http://sandbox:4000), otherwise fall back to SANDBOX_HOST/PORT
    const rawSandboxUrl = process.env.SANDBOX_URL;
    let url: string;
    if (rawSandboxUrl) {
      const base = rawSandboxUrl.replace(/\/$/, '');
      url = `${base}/api/sandbox/execute`;
    } else {
      const sandboxHost = process.env.SANDBOX_HOST || 'localhost';
      const sandboxPort = process.env.SANDBOX_PORT || '4000';
      url = `http://${sandboxHost}:${sandboxPort}/api/sandbox/execute`;
    }

    try {
      const axiosOpts: any = {
        timeout: (execConfig.timeLimit + 5) * 1000, // small buffer
      };
      if (options?.authHeader) {
        axiosOpts.headers = { Authorization: options.authHeader };
      }

      const resp = await axios.post(url, execConfig, axiosOpts);
      return resp.data;
    } catch (err: any) {
      // Normalize axios error and include detailed context
      if (err.response) {
        const status = err.response.status;
        const body = err.response.data;
        throw new BaseException(
          `Sandbox error: status=${status}, message=${body?.message || JSON.stringify(body)}`
        );
      }

      // Network / timeout / other error
      throw new BaseException(
        `Failed to call sandbox service: ${err.message || 'Unknown error'}${err.code ? `, code=${err.code}` : ''}`
      );
    }
  }

  async getSubmissionStatus(submissionId: string): Promise<SubmissionStatus | null> {
    const submission = await this.submissionRepository.findById(submissionId);
    if (!submission) {
      return null;
    }

    // Get result details if submission is completed
    let result: SubmissionResult | undefined;
    let score: number | undefined;

    if (
      submission.status !== ESubmissionStatus.PENDING &&
      submission.status !== ESubmissionStatus.RUNNING
    ) {
      const resultSubmissions =
        await this.resultSubmissionRepository.findBySubmissionId(submissionId);
      const testcases = await this.testcaseRepository.findByProblemId(submission.problemId);
      const testcaseMap = new Map(testcases.map(tc => [tc.id, tc]));

      result = {
        passed: resultSubmissions.filter(rs => rs.isPassed).length,
        total: resultSubmissions.length,
        results: resultSubmissions.map(rs => {
          const testcase = testcaseMap.get(rs.testcaseId);
          return {
            testcaseId: rs.testcaseId,
            input: testcase?.input || '',
            expectedOutput: testcase?.output || '',
            actualOutput: rs.actualOutput,
            isPassed: rs.isPassed,
            executionTime: rs.executionTime,
            memoryUse: rs.memoryUse,
            error: rs.error,
            isPublic: testcase?.isPublic || false,
          };
        }),
      };

      // Calculate score from testcases
      const totalPoints = testcases.reduce((sum, tc) => sum + tc.point, 0);
      const achievedPoints = resultSubmissions
        .filter(rs => rs.isPassed)
        .reduce((sum, rs) => {
          const testcase = testcaseMap.get(rs.testcaseId);
          return sum + (testcase?.point || 0);
        }, 0);

      score = totalPoints > 0 ? Math.round((achievedPoints / totalPoints) * 100) : 0;
    }

    return {
      submissionId: submission.id,
      userId: submission.userId,
      problemId: submission.problemId,
      language: submission.language,
      sourceCode: submission.sourceCode,
      status: submission.status as any,
      result: result
        ? {
            passed: result.passed,
            total: result.total,
            results: result.results.map((r, index) => ({
              index,
              input: r.input,
              expected: r.expectedOutput,
              actual: r.actualOutput || '',
              ok: r.isPassed,
              stderr: r.error || '',
              executionTime: r.executionTime || 0,
              error: r.error || undefined,
              isPublic: r.isPublic || false,
            })),
          }
        : undefined,
      score,
      submittedAt: submission.submittedAt,
      judgedAt: submission.judgedAt || undefined,
      executionTime: result?.results.reduce(
        (sum: number, r: any) => sum + (r.executionTime || 0),
        0
      ),
    };
  }

  async updateSubmissionStatus(
    submissionId: string,
    status: ESubmissionStatus
  ): Promise<SubmissionEntity | null> {
    return await this.submissionRepository.updateStatus(submissionId, status);
  }

  async updateSubmissionResult(
    submissionId: string,
    data: {
      status: ESubmissionStatus;
      result: SubmissionResult;
      score: number;
      judgedAt?: string;
    }
  ): Promise<SubmissionEntity | null> {
    // Update submission status
    const submission = await this.submissionRepository.updateStatus(
      submissionId,
      data.status,
      data.judgedAt ? new Date(data.judgedAt) : new Date()
    );

    if (!submission) {
      return null;
    }

    // Delete existing results
    await this.resultSubmissionRepository.deleteBySubmissionId(submissionId);

    // Create new result submissions (only store actual execution results)
    const resultSubmissions = data.result.results.map(r => ({
      submissionId,
      testcaseId: r.testcaseId,
      actualOutput: r.actualOutput,
      isPassed: r.isPassed,
      executionTime: r.executionTime,
      memoryUse: r.memoryUse,
      error: r.error,
    }));

    // Create result submissions
    await this.resultSubmissionRepository.createBatch(resultSubmissions);

    return submission;
  }

  async listSubmissions(options: {
    userId?: string;
    problemId?: string;
    status?: ESubmissionStatus;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: SubmissionStatus[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const paginationOptions: PaginationOptions = {
      page: Math.floor((options.offset || 0) / (options.limit || 20)) + 1,
      limit: options.limit || 20,
    };

    let submissions: SubmissionEntity[];
    let pagination: any;

    if (options.userId && options.problemId) {
      const result = await this.submissionRepository.findByUserAndProblem(
        options.userId,
        options.problemId,
        paginationOptions
      );
      submissions = result.data;
      pagination = result.pagination;
    } else if (options.userId) {
      const result = await this.submissionRepository.findByUserId(
        options.userId,
        paginationOptions
      );
      submissions = result.data;
      pagination = result.pagination;
    } else if (options.problemId) {
      const result = await this.submissionRepository.findByProblemId(
        options.problemId,
        paginationOptions
      );
      submissions = result.data;
      pagination = result.pagination;
    } else if (options.status) {
      const result = await this.submissionRepository.findByStatus(
        options.status,
        paginationOptions
      );
      submissions = result.data;
      pagination = result.pagination;
    } else {
      const result = await this.submissionRepository.findMany(paginationOptions);
      submissions = result.data;
      pagination = result.pagination;
    }

    // Convert to SubmissionStatus format
    const data: SubmissionStatus[] = [];
    for (const submission of submissions) {
      const status = await this.getSubmissionStatus(submission.id);
      if (status) {
        data.push(status);
      }
    }

    return { data, pagination };
  }

  async getQueueStatus(): Promise<{
    queueLength: number;
    isHealthy: boolean;
  }> {
    const status = await queueService.getQueueStatus();
    return {
      queueLength: status.length,
      isHealthy: status.isHealthy,
    };
  }

  calculateScore(
    results: Array<{ testcaseId: string; isPassed: boolean; point: number }>,
    testcases: TestcaseEntity[]
  ): number {
    const testcaseMap = new Map(testcases.map(tc => [tc.id, tc]));
    let totalScore = 0;
    let maxScore = 0;

    results.forEach(result => {
      const testcase = testcaseMap.get(result.testcaseId);
      if (testcase) {
        maxScore += testcase.point;
        if (result.isPassed) {
          totalScore += testcase.point;
        }
      }
    });

    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  }

  async getSubmissionStats(
    userId?: string,
    problemId?: string
  ): Promise<{
    total: number;
    pending: number;
    running: number;
    accepted: number;
    wrongAnswer: number;
    timeLimitExceeded: number;
    memoryLimitExceeded: number;
    runtimeError: number;
    compilationError: number;
  }> {
    return await this.submissionRepository.getSubmissionStats(userId, problemId);
  }
}

export const submissionService = new SubmissionService();
