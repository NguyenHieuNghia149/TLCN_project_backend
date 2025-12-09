import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { ExamService } from '@/services/exam.service';
import {
  CreateExamInput,
  CreateExamSchema,
  JoinExamInput,
  JoinExamSchema,
  SubmitExamInput,
  SubmitExamSchema,
  GetExamLeaderboardSchema,
} from '@/validations/exam.validation';
import {
  ExamIdRequiredException,
  ExamNotFoundException,
  ExamParticipationNotFoundException,
} from '@/exceptions/exam.exceptions';
import { BaseException, ErrorHandler, UserNotFoundException } from '@/exceptions/auth.exceptions';
import { z } from 'zod';
import { th } from 'zod/v4/locales';

export class ExamController {
  constructor(private readonly examService: ExamService) {}

  async createExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const examData = req.body as CreateExamInput;
      const result = await this.examService.createExam(examData);

      return res.status(201).json({
        success: true,
        message: 'Exam created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExamById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ExamIdRequiredException();
      }

      const result = await this.examService.getExamById(id);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExams(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const offset = parseInt((req.query.offset as string) || '0', 10);

      const search = (req.query.search as string) || undefined;
      const filterType = (req.query.filterType as any) || 'all';
      // try to extract userId from authenticated request if present
      const userId = (req as any).user?.userId || undefined;

      const result = await this.examService.getExams(limit, offset, search, filterType, userId);

      return res.status(200).json({
        success: true,
        data: result.data,
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }

  async getExamChallenge(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { examId, challengeId } = req.params;

      if (!examId || !challengeId) {
        throw new ExamIdRequiredException();
      }

      const result = await this.examService.getExamChallenge(examId, challengeId);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getParticipation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { examId, participationId } = req.params as {
        examId?: string;
        participationId?: string;
      };

      if (!examId || !participationId) {
        throw new ExamIdRequiredException();
      }

      const userId = req.user?.userId;

      const result = await this.examService.getParticipation(examId, participationId, userId);

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getMyParticipation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { examId } = req.params as { examId?: string };
      if (!examId) {
        throw new ExamIdRequiredException();
      }
      const userId = req.user?.userId;
      if (!userId) {
        throw new UserNotFoundException();
      }

      const result = await this.examService.getMyParticipation(examId, userId);

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getOrCreateSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { examId } = req.params as { examId?: string };
      if (!examId) throw new ExamIdRequiredException();
      const userId = req.user?.userId;
      if (!userId) throw new UserNotFoundException();

      const result = await this.examService.getOrCreateSession(examId, userId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async syncSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { sessionId, answers, clientTimestamp } = req.body as {
        sessionId?: string;
        answers?: any;
        clientTimestamp?: string;
      };
      const userId = req.user?.userId;
      if (!userId) throw new UserNotFoundException();
      if (!sessionId) throw new BaseException('Session ID is required', 400, 'SESSION_ID_REQUIRED');

      const ok = await this.examService.syncSession(sessionId, answers, clientTimestamp);
      return res.status(200).json({ success: ok });
    } catch (error) {
      next(error);
    }
  }

  async joinExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params as { id: string };
      const { password } = req.body as { password?: string };

      if (!userId) {
        throw new UserNotFoundException();
      }

      const result = await this.examService.joinExam(id, userId, password || '');

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async submitExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const userId = req.user?.userId;
      const { participationId } = req.body as { participationId?: string };

      if (!userId) {
        throw new UserNotFoundException();
      }

      if (!participationId) {
        throw new BaseException('Participation ID is required', 400, 'PARTICIPATION_ID_REQUIRED');
      }

      const result = await this.examService.submitExam(participationId, userId);

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { id } = req.params as { id: string };
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const offset = parseInt((req.query.offset as string) || '0', 10);

      const result = await this.examService.getExamLeaderboard(id, limit, offset);

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getExamLeaderboard(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { examId, limit = 50, offset = 0 } = req.query as any;

      if (!examId) {
        throw new ExamIdRequiredException();
      }

      const result = await this.examService.getExamLeaderboard(
        examId,
        parseInt(limit) || 50,
        parseInt(offset) || 0
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
  async getParticipationSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    try {
      const { examId, participationId } = req.params as {
        examId: string;
        participationId: string;
      };
      const userId = (req as any).user?.userId;
      const userRole = (req as any).user?.role;

      if (!userId) {
        throw new BaseException('User not authenticated', 401, 'UNAUTHORIZED');
      }

      const result = await this.examService.getParticipationSubmission(
        examId,
        participationId,
        userId,
        userRole
      );

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle Postgres unique violation for exams
    const anyError = error as any;
    if (anyError && anyError.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Exam already exists',
        code: 'DUPLICATE_EXAM',
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
    console.error('Unexpected error in ExamController:', error);

    // Return generic error response
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}

// Export schema for route validation
export { CreateExamSchema, JoinExamSchema, SubmitExamSchema, GetExamLeaderboardSchema };
