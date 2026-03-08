import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { ExamService } from '@/services/exam.service';
import {
  CreateExamInput,
  CreateExamSchema,
  GetExamLeaderboardSchema,
} from '@/validations/exam.validation';
import { ExamIdRequiredException } from '@/exceptions/exam.exceptions';
import { AppException } from '@/exceptions/base.exception';
import { UserNotFoundException } from '@/exceptions/auth.exceptions';

export class ExamController {
  constructor(private readonly examService: ExamService) {}

  async createExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const examData = req.body as CreateExamInput;
    const result = await this.examService.createExam(examData);

    res.status(201).json({
      message: 'Exam created successfully',
      ...result,
    });
  }

  async updateExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { id } = req.params;

    if (!id) {
      throw new ExamIdRequiredException();
    }

    const examData = req.body;
    const result = await this.examService.updateExam(id as string, examData);

    res.status(200).json({
      message: 'Exam updated successfully',
      ...result,
    });
  }

  async deleteExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { id } = req.params;

    if (!id) {
      throw new ExamIdRequiredException();
    }

    await this.examService.deleteExam(id as string);

    res.status(200).json({
      message: 'Exam deleted successfully',
    });
  }

  async getExamById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { id } = req.params;

    if (!id) {
      throw new ExamIdRequiredException();
    }

    const result = await this.examService.getExamById(id as string);

    res.status(200).json(result);
  }

  async getExams(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const search = (req.query.search as string) || undefined;
    const filterType = (req.query.filterType as any) || 'all';
    // try to extract userId from authenticated request if present
    const userId = (req as any).user?.userId || undefined;

    let isVisible: boolean | undefined = undefined;
    if (req.query.isVisible !== undefined) {
      isVisible = req.query.isVisible === 'true';
    }

    const result = await this.examService.getExams(
      limit,
      offset,
      search,
      filterType,
      userId,
      isVisible
    );

    res.status(200).json({
      data: result.data,
      total: result.total,
    });
  }

  async getExamChallenge(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { examId, challengeId } = req.params;

    if (!examId || !challengeId) {
      throw new ExamIdRequiredException();
    }

    const result = await this.examService.getExamChallenge(examId as string, challengeId as string);

    res.status(200).json(result);
  }

  async getParticipation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { examId, participationId } = req.params as {
      examId?: string;
      participationId?: string;
    };

    if (!examId || !participationId) {
      throw new ExamIdRequiredException();
    }

    const userId = req.user?.userId;

    const result = await this.examService.getParticipation(examId, participationId, userId);

    res.status(200).json(result);
  }

  async getMyParticipation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { examId } = req.params as { examId?: string };
    if (!examId) {
      throw new ExamIdRequiredException();
    }
    const userId = req.user?.userId;
    if (!userId) {
      throw new UserNotFoundException();
    }

    const result = await this.examService.getMyParticipation(examId, userId);

    res.status(200).json(result);
  }

  async getOrCreateSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { examId } = req.params as { examId?: string };
    if (!examId) throw new ExamIdRequiredException();
    const userId = req.user?.userId;
    if (!userId) throw new UserNotFoundException();

    const result = await this.examService.getOrCreateSession(examId, userId);
    res.status(200).json(result);
  }

  async syncSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { sessionId, answers, clientTimestamp } = req.body as {
      sessionId?: string;
      answers?: any;
      clientTimestamp?: string;
    };
    const userId = req.user?.userId;
    if (!userId) throw new UserNotFoundException();
    if (!sessionId) throw new AppException('Session ID is required', 400, 'SESSION_ID_REQUIRED');

    const ok = await this.examService.syncSession(sessionId, answers, clientTimestamp);
    res.status(200).json({ success: ok });
  }

  async joinExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;
    const { id } = req.params as { id: string };
    const { password } = req.body as { password?: string };

    if (!userId) {
      throw new UserNotFoundException();
    }

    const result = await this.examService.joinExam(id, userId, password || '');

    res.status(200).json(result);
  }

  async submitExam(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;
    const { participationId } = req.body as { participationId?: string };

    if (!userId) {
      throw new UserNotFoundException();
    }

    if (!participationId) {
      throw new AppException('Participation ID is required', 400, 'PARTICIPATION_ID_REQUIRED');
    }

    const result = await this.examService.submitExam(participationId, userId);

    res.status(200).json(result);
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { id } = req.params as { id: string };
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const result = await this.examService.getExamLeaderboard(id, limit, offset);

    res.status(200).json(result);
  }

  async getExamLeaderboard(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { examId, limit = 50, offset = 0 } = req.query as any;

    if (!examId) {
      throw new ExamIdRequiredException();
    }

    const result = await this.examService.getExamLeaderboard(
      examId,
      parseInt(limit) || 50,
      parseInt(offset) || 0
    );

    res.status(200).json(result);
  }
  async getParticipationSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { examId, participationId } = req.params as {
      examId: string;
      participationId: string;
    };
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const result = await this.examService.getParticipationSubmission(
      examId,
      participationId,
      userId,
      userRole
    );

    res.status(200).json(result);
  }
}

// Export schema for route validation
export { CreateExamSchema, GetExamLeaderboardSchema };
