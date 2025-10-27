import { Request, Response, NextFunction } from 'express';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';
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
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
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

  async getSubmissionStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { submissionId } = req.params;

      if (!submissionId) {
        return res.status(400).json({
          success: false,
          message: 'Submission ID is required',
          code: 'MISSING_SUBMISSION_ID',
        });
      }

      const status = await this.submissionService.getSubmissionStatus(submissionId);

      if (!status) {
        return res.status(404).json({
          success: false,
          message: 'Submission not found',
          code: 'SUBMISSION_NOT_FOUND',
        });
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
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      const { limit, offset, status } = req.query as unknown as GetSubmissionsQuery;

      const result = await this.submissionService.listSubmissions({
        userId,
        limit,
        offset,
        status: status as any,
      });

      // Filter by status if provided
      const filteredSubmissions = status
        ? result.data.filter((sub: any) => sub.status === status)
        : result.data;

      res.status(200).json({
        success: true,
        data: {
          submissions: filteredSubmissions,
          total: filteredSubmissions.length,
          limit,
          offset,
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
      const { limit, offset, status } = req.query as unknown as GetSubmissionsQuery;

      if (!problemId) {
        return res.status(400).json({
          success: false,
          message: 'Problem ID is required',
          code: 'MISSING_PROBLEM_ID',
        });
      }

      const result = await this.submissionService.listSubmissions({
        problemId,
        limit,
        offset,
        status: status as any,
      });

      // Filter by status if provided
      const filteredSubmissions = status
        ? result.data.filter((sub: any) => sub.status === status)
        : result.data;

      res.status(200).json({
        success: true,
        data: {
          submissions: filteredSubmissions,
          total: filteredSubmissions.length,
          limit,
          offset,
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
        return res.status(400).json({
          success: false,
          message: 'Submission ID is required',
          code: 'MISSING_SUBMISSION_ID',
        });
      }

      const status = await this.submissionService.getSubmissionStatus(submissionId);

      if (!status) {
        return res.status(404).json({
          success: false,
          message: 'Submission not found',
          code: 'SUBMISSION_NOT_FOUND',
        });
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
