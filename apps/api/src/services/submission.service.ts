import { JudgeUtils, logger, buildTestcaseDisplay } from '@backend/shared/utils';
import { ESubmissionStatus, FunctionSignature } from '@backend/shared/types';
import { getJudgeQueueService } from '@backend/shared/runtime/judge-queue';
import type { QueueJob } from '@backend/shared/runtime/judge-queue';
import crypto from 'crypto';
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

  private getQueueService() {
    return getJudgeQueueService();
  }

  async submitCode(input: CreateSubmissionInput & { userId: string }): Promise<{
    submissionId: string;
    status: ESubmissionStatus;
    queuePosition: number;
    estimatedWaitTime: number;
  }> {
    const { problem, testcases } = await this.validateProblemAndTestcases(input.problemId);
    this.assertFunctionSignatureLanguage(problem, input.language);

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
    this.assertFunctionSignatureLanguage(problem, input.language);

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

    await this.getQueueService().addJob(job);

    return {
      submissionId,
      status: ESubmissionStatus.PENDING,
      message: 'Queued for execution',
    };
  }

  private assertFunctionSignatureLanguage(problem: any, language: string): void {
    if (!problem?.functionSignature) {
      throw new BaseException(
        'Problem functionSignature is not configured',
        500,
        'FUNCTION_SIGNATURE_NOT_CONFIGURED'
      );
    }

    if (!['cpp', 'java', 'python'].includes(language)) {
      throw new BaseException(
        `Language ${language} is not supported for function-signature problems`,
        400,
        'FUNCTION_SIGNATURE_LANGUAGE_UNSUPPORTED'
      );
    }
  }

  private async validateProblemAndTestcases(problemId: string) {
    const problem = await this.problemRepository.findById(problemId);
    if (!problem) {
      throw new BaseException('Problem not found', 404, 'PROBLEM_NOT_FOUND');
    }

    if (!problem.functionSignature) {
      throw new BaseException(
        'Problem functionSignature is not configured',
        500,
        'FUNCTION_SIGNATURE_NOT_CONFIGURED'
      );
    }

    const testcases = await this.testcaseRepository.findByProblemId(problemId);
    if (testcases.length === 0) {
      throw new BaseException('No testcases found for this problem', 404, 'NO_TESTCASES_FOUND');
    }

    const missingStructuredTestcase = testcases.find(
      testcase => testcase.inputJson === null || testcase.outputJson === null
    );

    if (missingStructuredTestcase) {
      throw new BaseException(
        'Problem testcases are missing structured function-signature data',
        500,
        'FUNCTION_SIGNATURE_TESTCASE_INVALID'
      );
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
    jobType: 'SUBMISSION' | 'RUN_CODE' = 'SUBMISSION'
  ): QueueJob {
    const functionSignature = problem.functionSignature as FunctionSignature;

    return {
      submissionId: submission.id,
      userId: submission.userId,
      problemId: submission.problemId,
      code: submission.sourceCode,
      language: submission.language,
      functionSignature,
      testcases: testcases.map((tc: any) => ({
        id: tc.id,
        inputJson: tc.inputJson as Record<string, unknown>,
        outputJson: tc.outputJson,
        point: tc.point,
        isPublic: tc.isPublic ?? false,
      })),
      timeLimit: problem.timeLimit || 1000,
      memoryLimit: problem.memoryLimit || '128m',
      createdAt: new Date().toISOString(),
      jobType,
    };
  }

  private async getQueueLengthSafely(): Promise<number> {
    try {
      return await this.getQueueService().getQueueLength();
    } catch (err) {
      return 0;
    }
  }

  private async addJobToQueueSafely(job: QueueJob): Promise<boolean> {
    try {
      await this.getQueueService().addJob(job);
      return true;
    } catch (err) {
      return false;
    }
  }

  private isCompletedStatus(status: string): boolean {
    return status !== ESubmissionStatus.PENDING && status !== ESubmissionStatus.RUNNING;
  }

  private async buildSubmissionStatuses(
    submissions: (SubmissionDataResponse & { problemTitle?: string })[]
  ): Promise<SubmissionStatus[]> {
    if (submissions.length === 0) {
      return [];
    }

    const completedSubmissions = submissions.filter(submission =>
      this.isCompletedStatus(submission.status)
    );

    const submissionIds = completedSubmissions.map(submission => submission.id);
    const problemIds = Array.from(
      new Set(completedSubmissions.map(submission => submission.problemId))
    );

    const [resultSubmissions, testcases, problems] = await Promise.all([
      submissionIds.length > 0
        ? this.resultSubmissionRepository.findBySubmissionIds(submissionIds)
        : Promise.resolve([]),
      problemIds.length > 0
        ? this.testcaseRepository.findByProblemIds(problemIds)
        : Promise.resolve([]),
      problemIds.length > 0
        ? this.problemRepository.findByIds(problemIds)
        : Promise.resolve([]),
    ]);

    const resultsBySubmissionId = new Map<string, any[]>();
    for (const resultSubmission of resultSubmissions) {
      if (!resultsBySubmissionId.has(resultSubmission.submissionId)) {
        resultsBySubmissionId.set(resultSubmission.submissionId, []);
      }

      resultsBySubmissionId.get(resultSubmission.submissionId)!.push(resultSubmission);
    }

    const testcasesByProblemId = new Map<string, any[]>();
    for (const testcase of testcases) {
      if (!testcasesByProblemId.has(testcase.problemId)) {
        testcasesByProblemId.set(testcase.problemId, []);
      }

      testcasesByProblemId.get(testcase.problemId)!.push(testcase);
    }

    const problemsById = new Map(problems.map(problem => [problem.id, problem]));

    return submissions.map(submission =>
      this.mapSubmissionStatus(
        submission,
        resultsBySubmissionId.get(submission.id) || [],
        testcasesByProblemId.get(submission.problemId) || [],
        problemsById.get(submission.problemId) || null
      )
    );
  }

  private mapSubmissionStatus(
    submission: SubmissionDataResponse & { problemTitle?: string },
    resultSubmissions: any[],
    testcases: any[],
    problem: { functionSignature: FunctionSignature | null } | null
  ): SubmissionStatus {
    let result: SubmissionResult | undefined;
    let score: number | undefined;

    if (this.isCompletedStatus(submission.status)) {
      if (!problem?.functionSignature) {
        logger.error('Problem functionSignature missing while mapping submission status', {
          problemId: submission.problemId,
          submissionId: submission.id,
        });
        throw new BaseException(
          'problem configuration invalid',
          500,
          'PROBLEM_CONFIGURATION_INVALID'
        );
      }

      const functionSignature = problem.functionSignature;
      const testcasesById = new Map(testcases.map(testcase => [testcase.id, testcase]));

      result = {
        passed: resultSubmissions.filter((resultSubmission: any) => resultSubmission.isPassed).length,
        total: resultSubmissions.length,
        results: resultSubmissions.map((resultSubmission: any) => {
          const testcase = testcasesById.get(resultSubmission.testcaseId);
          const display = testcase
            ? buildTestcaseDisplay(functionSignature, {
                inputJson: testcase.inputJson as Record<string, unknown>,
                outputJson: testcase.outputJson,
              })
            : { input: '', output: '' };

          return {
            testcaseId: resultSubmission.testcaseId,
            input: display.input,
            expectedOutput: display.output,
            actualOutput: resultSubmission.actualOutput,
            isPassed: resultSubmission.isPassed,
            executionTime: resultSubmission.executionTime,
            memoryUse: resultSubmission.memoryUse,
            error: resultSubmission.error,
            isPublic: testcase?.isPublic || false,
          };
        }),
      };

      score = JudgeUtils.calculateScore(resultSubmissions, testcases);
    }

    const mappedStatus: SubmissionStatus = {
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
            results: result.results.map((item: any, index: number) => ({
              index,
              input: item.input,
              expected: item.expectedOutput,
              actual: item.actualOutput || '',
              ok: item.isPassed,
              stderr: item.error || '',
              executionTime: item.executionTime || 0,
              error: item.error || undefined,
              isPublic: item.isPublic || false,
            })),
          }
        : undefined,
      score,
      submittedAt:
        submission.submittedAt instanceof Date
          ? submission.submittedAt
          : new Date(submission.submittedAt),
      judgedAt: submission.judgedAt
        ? submission.judgedAt instanceof Date
          ? submission.judgedAt
          : new Date(submission.judgedAt)
        : undefined,
      executionTime: result?.results.reduce(
        (sum: number, item: any) => sum + (item.executionTime || 0),
        0
      ),
    };

    if (submission.problemTitle) {
      (mappedStatus as any).problemTitle = submission.problemTitle;
    }

    return mappedStatus;
  }

  async getSubmissionStatus(submissionId: string): Promise<SubmissionStatus | null> {
    const submission = await this.submissionRepository.findById(submissionId);
    if (!submission) {
      return null;
    }

    const [status] = await this.buildSubmissionStatuses([this.mapToSubmissionDataResponse(submission)]);
    return status || null;
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

  async requeuePendingSubmission(submissionId: string): Promise<boolean> {
    const submission = await this.submissionRepository.findById(submissionId);

    if (!submission || submission.status !== ESubmissionStatus.PENDING) {
      return false;
    }

    const { problem, testcases } = await this.validateProblemAndTestcases(submission.problemId);
    const job = this.prepareQueueJob(submission, problem, testcases, 'SUBMISSION');

    await this.getQueueService().addJob(job);

    return true;
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
    const submission = await this.submissionRepository.finalizeSubmissionResult({
      submissionId,
      status: data.status,
      result: data.result,
      judgedAt: data.judgedAt,
    });

    if (!submission) {
      logger.warn(
        `[Idempotency] Submission ${submissionId} already in terminal state. Ignoring retry.`
      );
      return null;
    }

    return submission;
  }

  private async enrichSubmissionsWithStatus(
    submissions: (SubmissionDataResponse & { problemTitle?: string })[]
  ): Promise<SubmissionStatus[]> {
    return this.buildSubmissionStatuses(submissions);
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
    const status = await this.getQueueService().getQueueStatus();
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

/** Creates a SubmissionService instance without keeping a module-level singleton. */
export function createSubmissionService(): SubmissionService {
  return new SubmissionService();
}

