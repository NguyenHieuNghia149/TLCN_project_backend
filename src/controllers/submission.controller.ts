import { Request, Response, NextFunction } from 'express';
import { AppException } from '@/exceptions/base.exception';
import {
  UserNotAuthenticatedException,
  SubmissionIdRequiredException,
  SubmissionNotFoundException,
  ProblemIdRequiredException,
} from '@/exceptions/submission.exceptions';
import {
  CreateSubmissionInput,
  GetSubmissionsQuery,
} from '@/validations/submission.validation';
import { SubmissionService } from '@/services/submission.service';

export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  async createSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const submissionData = req.body as CreateSubmissionInput;
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new UserNotAuthenticatedException();
    }

    const result = await this.submissionService.submitCode({
      ...submissionData,
      userId,
    });

    res.status(201).json({
      message: 'Submission created successfully',
      ...result,
    });
  }

  async runCode(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const runData = req.body as CreateSubmissionInput;
    const userId = (req as any).user?.userId;

    const authHeader = req.headers.authorization as string | undefined;
    const result = await this.submissionService.runCode({ ...runData, userId }, { authHeader });

    res.status(200).json(result);
  }

  async getSubmissionStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { submissionId } = req.params;

    if (!submissionId) {
      throw new SubmissionIdRequiredException();
    }

    const status = await this.submissionService.getSubmissionStatus(submissionId);

    if (!status) {
      throw new SubmissionNotFoundException();
    }

    res.status(200).json(status);
  }

  async getUserSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new UserNotAuthenticatedException();
    }

    const { limit, offset, status } = req.query as unknown as GetSubmissionsQuery;

    const result = await this.submissionService.listUserSubmissions(userId, status as any, {
      limit,
      offset,
    });

    res.status(200).json({
      submissions: result.data,
      total: result.pagination.total,
      limit: result.pagination.limit,
      offset: (result.pagination.page - 1) * result.pagination.limit,
    });
  }

  async getProblemSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { problemId } = req.params;

    if (!problemId) {
      throw new ProblemIdRequiredException();
    }

    const result = await this.submissionService.listProblemSubmissions(problemId, {
      limit: 10,
      offset: 0,
    });

    const filteredSubmissions = result.data;

    res.status(200).json({
      submissions: filteredSubmissions,
      total: filteredSubmissions.length,
      limit: 10,
      offset: 0,
    });
  }

  async getProblemSubmissionsByUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    const { problemId } = req.params;
    const { limit, offset, status, participationId } =
      req.query as unknown as GetSubmissionsQuery;

    if (!userId) {
      throw new UserNotAuthenticatedException();
    }

    if (!problemId) {
      throw new ProblemIdRequiredException();
    }

    const result = await this.submissionService.listUserProblemSubmissions(
      userId,
      problemId,
      participationId,
      { limit, offset, status: status as any }
    );

    res.status(200).json({
      submissions: result.data,
      pagination: result.pagination,
    });
  }

  async getQueueStatus(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const status = await this.submissionService.getQueueStatus();
    res.status(200).json(status);
  }

  async getSubmissionResults(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { submissionId } = req.params;

    if (!submissionId) {
      throw new SubmissionIdRequiredException();
    }

    const status = await this.submissionService.getSubmissionStatus(submissionId);

    if (!status) {
      throw new SubmissionNotFoundException();
    }

    res.status(200).json({
      submissionId: status.submissionId,
      status: status.status,
      result: status.result,
      score: status.score,
      submittedAt: status.submittedAt,
      judgedAt: status.judgedAt,
    });
  }
}

// Export validation schemas for use in routes
