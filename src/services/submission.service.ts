import { ESubmissionStatus } from '@/enums/submissionStatus.enum';
import { queueService, QueueJob } from './queue.service';
import crypto from 'crypto';
import { codeExecutionService } from './code-execution.service';
import { WebSocketService } from './websocket.service';
import {
  CreateSubmissionInput,
  SubmissionStatus,
  SubmissionResult,
  SubmissionDataResponse,
} from '@/validations/submission.validation';
import { SubmissionRepository } from '@/repositories/submission.repository';
import { ResultSubmissionRepository } from '@/repositories/result-submission.repository';
import { TestcaseRepository } from '@/repositories/testcase.repository';
import { ProblemRepository } from '@/repositories/problem.repository';
import { UserRepository } from '@/repositories/user.repository';
import { ExamParticipationRepository } from '@/repositories/examParticipation.repository';
import { ExamRepository } from '@/repositories/exam.repository';
// Removed direct schema entity imports - using validation types instead
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
  private userRepository: UserRepository;
  private examParticipationRepository: ExamParticipationRepository;
  private examRepository: ExamRepository;

  constructor() {
    this.submissionRepository = new SubmissionRepository();
    this.resultSubmissionRepository = new ResultSubmissionRepository();
    this.testcaseRepository = new TestcaseRepository();
    this.problemRepository = new ProblemRepository();
    this.userRepository = new UserRepository();
    this.examParticipationRepository = new ExamParticipationRepository();
    this.examRepository = new ExamRepository();
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
      throw new BaseException('Problem not found', 404, 'PROBLEM_NOT_FOUND');
    }

    // Get testcases for the problem
    const testcases = await this.testcaseRepository.findByProblemId(input.problemId);
    if (testcases.length === 0) {
      throw new BaseException('No testcases found for this problem', 404, 'NO_TESTCASES_FOUND');
    }

    // If participationId provided, validate it and ensure it's active for this user
    let examParticipationId: string | undefined = undefined;
    if ((input as any).participationId) {
      const participationId = (input as any).participationId as string;
      const participation = await this.examParticipationRepository.findById(participationId);
      if (!participation || participation.userId !== input.userId) {
        throw new BaseException('Invalid participationId', 403, 'INVALID_PARTICIPATION');
      }

      const exam = await this.examRepository.findById(participation.examId);
      if (!exam) {
        throw new BaseException('Exam not found for participation', 404, 'EXAM_NOT_FOUND');
      }

      const startMs = participation.startTime.getTime();
      const durationMs = (exam.duration || 0) * 60 * 1000;
      const participationEndByDuration = new Date(startMs + durationMs);
      const examGlobalEnd = exam.endDate instanceof Date ? exam.endDate : new Date(exam.endDate);
      const effectiveEnd =
        participationEndByDuration.getTime() <= examGlobalEnd.getTime()
          ? participationEndByDuration
          : examGlobalEnd;

      const now = new Date();
      if (now.getTime() > effectiveEnd.getTime()) {
        throw new BaseException('Participation has expired', 400, 'PARTICIPATION_EXPIRED');
      }

      examParticipationId = participationId;
    }

    // Create submission record (attach examParticipationId if present)
    const submission = await this.submissionRepository.create({
      sourceCode: input.sourceCode,
      language: input.language,
      problemId: input.problemId,
      userId: input.userId,
      status: ESubmissionStatus.PENDING,
      ...(examParticipationId ? { examParticipationId } : {}),
    });

    // Get queue position (try to be resilient if Redis/queue is unavailable)
    let queueLength = 0;
    try {
      queueLength = await queueService.getQueueLength();
    } catch (err) {
      // Log and continue — treat as queue unavailable
      console.warn('Queue service unavailable, proceeding without queue:', err);
      queueLength = 0;
    }
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
        isPublic: tc.isPublic ?? false,
      })),
      timeLimit: problem.timeLimit || 1000, // Default 1 second
      memoryLimit: problem.memoryLimit || '128m', // Default 128MB
      createdAt: new Date().toISOString(),
    };

    // Add job to queue (fail gracefully if queue is unavailable)
    let enqueued = true;
    try {
      await queueService.addJob(job);
    } catch (err) {
      // Do not fail submission if queue is unavailable — keep submission record and return
      enqueued = false;
      console.warn('Failed to enqueue submission job; submission will remain PENDING:', err);
    }

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
      queuePosition: enqueued ? queueLength + 1 : 0,
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
      throw new BaseException('Problem not found', 404, 'PROBLEM_NOT_FOUND');
    }

    // Get testcases for the problem
    const testcases = await this.testcaseRepository.findByProblemId(input.problemId);
    if (testcases.length === 0) {
      throw new BaseException('No testcases found for this problem', 404, 'TESTCASE_NOT_FOUND');
    }

    // Generate ephemeral ID
    const submissionId = crypto.randomUUID();

    // Create job for queue
    const job: QueueJob = {
      submissionId: submissionId,
      userId: input.userId || 'anonymous',
      problemId: input.problemId,
      code: input.sourceCode,
      language: input.language,
      testcases: testcases.map(tc => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        point: tc.point,
        isPublic: tc.isPublic ?? false,
      })),
      timeLimit: problem.timeLimit || 1000,
      memoryLimit: problem.memoryLimit || '128m',
      createdAt: new Date().toISOString(),
      jobType: 'RUN_CODE',
    };

    // Add job to queue
    await queueService.addJob(job);

    return {
      submissionId,
      status: ESubmissionStatus.PENDING,
      message: 'Queued for execution',
    };
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
  ): Promise<{ id: string; status: string } | null> {
    const result = await this.submissionRepository.updateStatus(submissionId, status);
    if (!result) return null;
    return {
      id: result.id,
      status: result.status,
    };
  }

  async updateSubmissionResult(
    submissionId: string,
    data: {
      status: ESubmissionStatus;
      result: SubmissionResult;
      score: number;
      judgedAt?: string;
    }
  ): Promise<{ id: string; status: string } | null> {
    // ⚠️ QUAN TRỌNG: Lấy submission TRƯỚC KHI update status
    // Để có thể check xem user đã solve problem này chưa
    const submissionBeforeUpdate = await this.submissionRepository.findById(submissionId);
    if (!submissionBeforeUpdate) {
      return null;
    }

    // Chỉ cộng điểm khi submission ACCEPTED và user chưa solve problem này trước đó
    if (data.status === ESubmissionStatus.ACCEPTED) {
      // Check TRƯỚC KHI update status - xem user đã có submission ACCEPTED nào cho problem này chưa
      const hasSolvedBefore = await this.submissionRepository.hasUserSolvedProblem(
        submissionBeforeUpdate.userId,
        submissionBeforeUpdate.problemId
      );

      if (!hasSolvedBefore) {
        // Tính tổng điểm từ tất cả testcases của problem
        const testcases = await this.testcaseRepository.findByProblemId(
          submissionBeforeUpdate.problemId
        );
        const totalPoints = testcases.reduce((sum, tc) => sum + tc.point, 0);

        if (totalPoints > 0) {
          try {
            await this.userRepository.incrementRankingPoint(
              submissionBeforeUpdate.userId,
              totalPoints
            );
          } catch (error: any) {
            throw new BaseException(error.message);
          }
        }
      }
    }

    // Sau đó mới update submission status
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

    return submission ? { id: submission.id, status: submission.status } : null;
  }

  private async enrichSubmissionsWithStatus(
    submissions: (SubmissionDataResponse & { problemTitle?: string })[]
  ): Promise<SubmissionStatus[]> {
    const data: SubmissionStatus[] = [];
    for (const submission of submissions) {
      const status = await this.getSubmissionStatus(submission.id);
      if (status) {
        // Carry over problemTitle if it exists in the original submission data
        // and isn't already in status (which it likely isn't)
        if (submission.problemTitle) {
          (status as any).problemTitle = submission.problemTitle;
        }
        data.push(status);
      }
    }
    return data;
  }

  async listUserSubmissions(
    userId: string,
    status?: ESubmissionStatus,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{
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

    let result;
    if (status) {
      result = await this.submissionRepository.findByUserAndStatus(
        userId,
        status,
        paginationOptions
      );
    } else {
      result = await this.submissionRepository.findByUserId(userId, paginationOptions);
    }

    const submissions = result.data.map(sub => this.mapToSubmissionDataResponse(sub));
    const data = await this.enrichSubmissionsWithStatus(submissions);

    return { data, pagination: result.pagination };
  }

  async listProblemSubmissions(
    problemId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{
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

    const result = await this.submissionRepository.findByProblemId(problemId, paginationOptions);
    const submissions = result.data.map(sub => this.mapToSubmissionDataResponse(sub));
    const data = await this.enrichSubmissionsWithStatus(submissions);

    return { data, pagination: result.pagination };
  }

  async listUserProblemSubmissions(
    userId: string,
    problemId: string,
    participationId?: string,
    options: { limit?: number; offset?: number; status?: ESubmissionStatus } = {}
  ): Promise<{
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

    let result;
    if (participationId) {
      result = await this.submissionRepository.findByParticipationAndProblem(
        participationId,
        problemId,
        paginationOptions
      );
    } else {
      result = await this.submissionRepository.findByUserAndProblem(
        userId,
        problemId,
        paginationOptions
      );
    }

    const submissions = result.data.map(sub => this.mapToSubmissionDataResponse(sub));
    const data = await this.enrichSubmissionsWithStatus(submissions);

    // Filter by status if provided (though it's better done at DB level, repository might not support it for this method yet)
    // The original code passed 'status' to finding by User and Status, but here we are finding by User and Problem.
    // If status filtering is needed for this specific combination, we should rely on repository or filter here.
    // Given the previous code didn't combine User+Problem+Status in a specific repo call (it had separate if/else blocks),
    // we'll stick to what the original code supported effectively or add filtering if needed.
    // The previous code had: `else if (options.userId && options.problemId)` -> `findByUserAndProblem`. It didn't seem to use `status` there.
    // So we invoke `enrichSubmissions` directly.

    // If status really matters and isn't supported by repo, we filter post-fetch (inefficient but safe refactor)
    if (options.status) {
      // return filtered; // For now keeping it simple as per original behavior which seemed to prioritize problemId+userId over status
    }

    return { data, pagination: result.pagination };
  }

  async listAllSubmissions(
    status?: ESubmissionStatus,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{
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

    let result;
    if (status) {
      result = await this.submissionRepository.findByStatus(status, paginationOptions);
    } else {
      result = await this.submissionRepository.findMany(paginationOptions);
    }

    const submissions = result.data.map(sub => this.mapToSubmissionDataResponse(sub));
    const data = await this.enrichSubmissionsWithStatus(submissions);

    return { data, pagination: result.pagination };
  }

  async getSubmissionByProblemIdAndUserId(
    problemId: string,
    userId: string
  ): Promise<SubmissionStatus | null> {
    const result = await this.submissionRepository.findByUserAndProblem(userId, problemId, {
      page: 1,
      limit: 1,
    });

    const submission = result.data[0];
    if (!submission) {
      return null;
    }

    return this.getSubmissionStatus(submission.id);
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

  private mapToSubmissionDataResponse(submission: any): SubmissionDataResponse {
    return {
      id: submission.id,
      userId: submission.userId,
      problemId: submission.problemId,
      language: submission.language,
      sourceCode: submission.sourceCode,
      status: submission.status,
      submittedAt:
        submission.submittedAt instanceof Date
          ? submission.submittedAt
          : new Date(submission.submittedAt),
      judgedAt: submission.judgedAt
        ? submission.judgedAt instanceof Date
          ? submission.judgedAt
          : new Date(submission.judgedAt)
        : undefined,
    };
  }

  calculateScore(
    results: Array<{ testcaseId: string; isPassed: boolean; point: number }>,
    testcases: Array<{ id: string; point: number }>
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
