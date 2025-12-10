import { Request, Response, NextFunction } from 'express';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';
import {
  UserNotAuthenticatedException,
  SubmissionIdRequiredException,
  SubmissionNotFoundException,
  ProblemIdRequiredException,
} from '@/exceptions/submission.exceptions';
import {
  CreateSubmissionInput,
  CreateSubmissionSchema,
  GetSubmissionsQuery,
  GetSubmissionsQuerySchema,
  SubmissionResponse,
  SubmissionStatus,
} from '@/validations/submission.validation';
import { z } from 'zod';
import { SubmissionService } from '@/services/submission.service';

export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  async createSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const submissionData = req.body as CreateSubmissionInput;
      const userId = (req as any).user?.userId; // Assuming user is attached by auth middleware

      if (!userId) {
        throw new UserNotAuthenticatedException();
      }

      const result = await this.submissionService.submitCode({
        ...submissionData,
        userId,
      });

      res.status(201).json({
        success: true,
        message: 'Submission created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async runCode(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const runData = req.body as CreateSubmissionInput;
      const userId = (req as any).user?.userId; // optional

      console.log('Running code for user:', userId);
      console.log('Run data:', runData);

      const authHeader = req.headers.authorization as string | undefined;
      const result = await this.submissionService.runCode({ ...runData, userId }, { authHeader });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissionStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { submissionId } = req.params;

      if (!submissionId) {
        throw new SubmissionIdRequiredException();
      }

      const status = await this.submissionService.getSubmissionStatus(submissionId);

      if (!status) {
        throw new SubmissionNotFoundException();
      }

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        throw new UserNotAuthenticatedException();
      }

      const { limit, offset, status } = req.query as unknown as GetSubmissionsQuery;

      const result = await this.submissionService.listUserSubmissions(userId, status as any, {
        limit,
        offset,
      });
      console.log(result);

      res.status(200).json({
        success: true,
        data: {
          submissions: result.data,
          total: result.pagination.total,
          limit: result.pagination.limit,
          offset: (result.pagination.page - 1) * result.pagination.limit,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getProblemSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { problemId } = req.params;
      console.log('Problem ID:', problemId);

      if (!problemId) {
        throw new ProblemIdRequiredException();
      }

      const result = await this.submissionService.listProblemSubmissions(problemId, {
        limit: 10,
        offset: 0,
      });

      // Filter by status if provided
      const filteredSubmissions = result.data;

      res.status(200).json({
        success: true,
        data: {
          submissions: filteredSubmissions,
          total: filteredSubmissions.length,
          limit: 10,
          offset: 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getProblemSubmissionsByUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
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
        success: true,
        data: {
          submissions: result.data,
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getQueueStatus(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const status = await this.submissionService.getQueueStatus();

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissionResults(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { submissionId } = req.params;

      if (!submissionId) {
        throw new SubmissionIdRequiredException();
      }

      const status = await this.submissionService.getSubmissionStatus(submissionId);

      if (!status) {
        throw new SubmissionNotFoundException();
      }

      // Return only the results part
      res.status(200).json({
        success: true,
        data: {
          submissionId: status.submissionId,
          status: status.status,
          result: status.result,
          score: status.score,
          submittedAt: status.submittedAt,
          judgedAt: status.judgedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Error handling middleware
  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle specific submission errors
    if (error.message.includes('Unsupported language')) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'UNSUPPORTED_LANGUAGE',
        timestamp: new Date().toISOString(),
      });
    }

    if (error.message.includes('Code too long')) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'CODE_TOO_LONG',
        timestamp: new Date().toISOString(),
      });
    }

    if (error.message.includes('No testcases found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'NO_TESTCASES',
        timestamp: new Date().toISOString(),
      });
    }

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    // Handle base exceptions
    if (error instanceof BaseException) {
      const errorResponse = ErrorHandler.getErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: errorResponse.timestamp,
      });
    }

    // Log unexpected errors
    console.error('Unexpected submission error:', error);

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}

// Export validation schemas for use in routes
