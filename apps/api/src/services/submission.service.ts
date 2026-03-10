import { JudgeUtils, logger } from '@backend/shared/utils';
import { ESubmissionStatus } from '@backend/shared/types';
import { queueService, QueueJob } from './queue.service';
import crypto from 'crypto';
import { WebSocketService } from './websocket.service';
import {
  CreateSubmissionInput,
  SubmissionStatus,
  SubmissionResult,
  SubmissionDataResponse,
} from '@backend/shared/validations/submission.validation';
import { SubmissionRepository } from '../repositories/submission.repository';
import { ResultSubmissionRepository } from '../repositories/result-submission.repository';
import { TestcaseRepository } from '../repositories/testcase.repository';
import { ProblemRepository } from '../repositories/problem.repository';
import { UserRepository } from '../repositories/user.repository';
import { ExamParticipationRepository } from '../repositories/examParticipation.repository';
import { ExamRepository } from '../repositories/exam.repository';
// Removed direct schema entity imports - using validation types instead
import { PaginationOptions } from '../repositories/base.repository';
import axios from 'axios';
import { BaseException } from '../exceptions/auth.exceptions';

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
    const { problem, testcases } = await this.validateProblemAndTestcases(input.problemId);

    let examParticipationId: string | undefined = undefined;
    if ((input as any).participationId) {
      examParticipationId = await this.validateExamParticipation(
        input.userId,
        (input as any).participationId
      );
    }

    const submission = await this.submissionRepository.create({
      sourceCode: input.sourceCode,
      language: input.language,
      problemId: input.problemId,
      userId: input.userId,
      status: ESubmissionStatus.PENDING,
      ...(examParticipationId ? { examParticipationId } : {}),
    });

    const queueLength = await this.getQueueLengthSafely();
    const estimatedWaitTime = queueLength * 30;

    const job = this.prepareQueueJob(submission, problem, testcases);

    const enqueued = await this.addJobToQueueSafely(job);

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
    const { problem, testcases } = await this.validateProblemAndTestcases(input.problemId);

    const submissionId = crypto.randomUUID();

    const job = this.prepareQueueJob(
      {
        id: submissionId,
        userId: input.userId || 'anonymous',
        problemId: input.problemId,
        sourceCode: input.sourceCode,
        language: input.language,
      },
      problem,
      testcases,
      'RUN_CODE'
    );

    await queueService.addJob(job);

    return {
      submissionId,
      status: ESubmissionStatus.PENDING,
      message: 'Queued for execution',
    };
  }

  private async validateProblemAndTestcases(problemId: string) {
    const problem = await this.problemRepository.findById(problemId);
    if (!problem) {
      throw new BaseException('Problem not found', 404, 'PROBLEM_NOT_FOUND');
    }

    const testcases = await this.testcaseRepository.findByProblemId(problemId);
    if (testcases.length === 0) {
      throw new BaseException('No testcases found for this problem', 404, 'NO_TESTCASES_FOUND');
    }

    return { problem, testcases };
  }

  private async validateExamParticipation(
    userId: string,
    participationId: string
  ): Promise<string> {
    const participation = await this.examParticipationRepository.findById(participationId);
    if (!participation || participation.userId !== userId) {
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

    return participationId;
  }

  private prepareQueueJob(
    submission: any,
    problem: any,
    testcases: any[],
    jobType: string = 'JUDGE'
  ): QueueJob {
    return {
      submissionId: submission.id,
      userId: submission.userId,
      problemId: submission.problemId,
      code: submission.sourceCode,
      language: submission.language,
      testcases: testcases.map((tc: any) => ({
        id: tc.id,
        input: tc.input,
        output: tc.output,
        point: tc.point,
        isPublic: tc.isPublic ?? false,
      })),
      timeLimit: problem.timeLimit || 1000,
      memoryLimit: problem.memoryLimit || '128m',
      createdAt: new Date().toISOString(),
      jobType: jobType as any,
    };
  }

  private async getQueueLengthSafely(): Promise<number> {
    try {
      return await queueService.getQueueLength();
    } catch (err) {
      return 0;
    }
  }

  private async addJobToQueueSafely(job: QueueJob): Promise<boolean> {
    try {
      await queueService.addJob(job);
      return true;
    } catch (err) {
      return false;
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

      result = {
        passed: resultSubmissions.filter((rs: any) => rs.isPassed).length,
        total: resultSubmissions.length,
        results: resultSubmissions.map((rs: any) => {
          const testcase = testcases.find((tc: any) => tc.id === rs.testcaseId);
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
      score = JudgeUtils.calculateScore(resultSubmissions, testcases);
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
            results: result.results.map((r: any, index: any) => ({
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
    // To check if user has already solved this problem
    const submissionBeforeUpdate = await this.submissionRepository.findById(submissionId);
    if (!submissionBeforeUpdate) {
      return null;
    }

    // Determine if we should add ranking points (safe check before idempotent update)
    let shouldAddPoints = false;
    let rankPointsToAdd = 0;

    if (data.status === ESubmissionStatus.ACCEPTED && !submissionBeforeUpdate.examParticipationId) {
      // Check BEFORE updating status - see if user already has an ACCEPTED submission for this problem
      const hasSolvedBefore = await this.submissionRepository.hasUserSolvedProblem(
        submissionBeforeUpdate.userId,
        submissionBeforeUpdate.problemId
      );

      if (!hasSolvedBefore) {
        shouldAddPoints = true;
        const testcases = await this.testcaseRepository.findByProblemId(
          submissionBeforeUpdate.problemId
        );
        rankPointsToAdd = testcases.reduce((sum: any, tc: any) => sum + tc.point, 0);
      }
    }

    // Idempotent Update (Rules Task 2.3)
    // Only update if current status is PENDING or RUNNING. If rowCount=0, this is a retry of a finished job, skip it.
    const submission = await this.submissionRepository.updateStatusIdempotent(
      submissionId,
      data.status,
      data.judgedAt ? new Date(data.judgedAt) : new Date()
    );

    if (!submission) {
      logger.warn(
        `[Idempotency] Submission ${submissionId} already in terminal state. Ignoring retry.`
      );
      return null;
    }

    // Apply ranking points IF it successfully transitioned to ACCEPTED for the first time
    if (shouldAddPoints && rankPointsToAdd > 0) {
      try {
        await this.userRepository.incrementRankingPoint(
          submissionBeforeUpdate.userId,
          rankPointsToAdd
        );
      } catch (error: any) {
        throw new BaseException(error.message);
      }
    }

    // Delete existing results
    await this.resultSubmissionRepository.deleteBySubmissionId(submissionId);

    // Create new result submissions (only store actual execution results)
    const resultSubmissions = data.result.results.map((r: any) => ({
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

    const submissions = result.data.map((sub: any) => this.mapToSubmissionDataResponse(sub));
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
    const submissions = result.data.map((sub: any) => this.mapToSubmissionDataResponse(sub));
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

    const submissions = result.data.map((sub: any) => this.mapToSubmissionDataResponse(sub));
    const data = await this.enrichSubmissionsWithStatus(submissions);

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

    const submissions = result.data.map((sub: any) => this.mapToSubmissionDataResponse(sub));
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
