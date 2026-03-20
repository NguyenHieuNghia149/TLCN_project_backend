import { Request, Response, NextFunction } from 'express';
import { AppException } from '@backend/api/exceptions/base.exception';
import {
  UserNotAuthenticatedException,
  SubmissionIdRequiredException,
  SubmissionNotFoundException,
  ProblemIdRequiredException,
} from '@backend/api/exceptions/submission.exceptions';
import {
  CreateSubmissionInput,
  GetSubmissionsQuery,
} from '@backend/shared/validations/submission.validation';
import { SubmissionService } from '@backend/api/services/submission.service';
import { ISubmissionEventStream } from '@backend/api/services/sse.service';

export class SubmissionController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly getSubmissionEventStream: () => ISubmissionEventStream
  ) {}

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

  async streamSubmissionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { submissionId } = req.params;

    if (!submissionId) {
      throw new SubmissionIdRequiredException();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      res.write(':\n\n');
    }, 15000);
    const submissionEventStream = this.getSubmissionEventStream();

    const cleanup = () => {
      clearInterval(heartbeat);
      submissionEventStream.removeListener(`submission_${submissionId}`, onUpdate);
    };

    const onUpdate = (data: any) => {
      if (data.results && Array.isArray(data.results)) {
        data.results = data.results.map((tc: any) => {
          if (tc.actual_output && tc.actual_output.length > 2048) {
            tc.actual_output = tc.actual_output.substring(0, 2048) + '... [TRUNCATED]';
          }
          if (tc.actualOutput && tc.actualOutput.length > 2048) {
            tc.actualOutput = tc.actualOutput.substring(0, 2048) + '... [TRUNCATED]';
          }
          return tc;
        });
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);

      const terminalStatuses = [
        'ACCEPTED',
        'WRONG_ANSWER',
        'TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED',
        'RUNTIME_ERROR',
        'COMPILATION_ERROR',
        'SYSTEM_ERROR',
        'INTERNAL_ERROR',
        'WA',
        'TLE',
        'MLE',
        'CE',
        'RE',
      ];

      if (
        terminalStatuses.includes(data.status) ||
        terminalStatuses.includes(data.overall_status)
      ) {
        cleanup();
        res.end();
      }
    };
    submissionEventStream.on(`submission_${submissionId}`, onUpdate);

    req.on('close', () => {
      cleanup();
    });
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

    const status = await this.submissionService.getSubmissionStatus(submissionId as string);

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

    const result = await this.submissionService.listProblemSubmissions(problemId as string, {
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
    const { limit, offset, status, participationId } = req.query as unknown as GetSubmissionsQuery;

    if (!userId) {
      throw new UserNotAuthenticatedException();
    }

    if (!problemId) {
      throw new ProblemIdRequiredException();
    }

    const result = await this.submissionService.listUserProblemSubmissions(
      userId,
      problemId as string,
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

    const status = await this.submissionService.getSubmissionStatus(submissionId as string);

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
