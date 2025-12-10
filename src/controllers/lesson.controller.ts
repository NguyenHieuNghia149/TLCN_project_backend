import { Request, Response, NextFunction } from 'express';
import { LessonService } from '../services/lesson.service';
import { BaseException, ErrorHandler } from '../exceptions/auth.exceptions';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  CreateLessonInput,
  CreateLessonSchema,
  UpdateLessonInput,
} from '../validations/lesson.validation';

export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const topicId = req.query.topicId as string | undefined;
      const result = await this.lessonService.getAllLessons(userId, topicId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const lessonId = req.params.lessonId;

    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'Lesson ID is required' });
    }
    const result = await this.lessonService.getLessonById(lessonId);
    res.status(200).json({ success: true, data: result });
  }

  async create(req: Request, res: Response, next: NextFunction) {
    const { title, content, topicId } = CreateLessonSchema.parse(req.body);
    const result = await this.lessonService.createLesson({ title, content, topicId });
    res.status(201).json({ success: true, message: 'Lesson created', data: result });
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { lessonId } = req.params;
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'Lesson ID is required' });
    }
    const { title, content, topicId } = req.body;
    const result = await this.lessonService.updateLesson(lessonId, { title, content, topicId });
    res.status(200).json({ success: true, message: 'Lesson updated', data: result });
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { lessonId } = req.params;
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'Lesson ID is required' });
    }
    await this.lessonService.deleteLesson(lessonId);
    res.status(200).json({ success: true, message: 'Lesson deleted' });
  }

  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    if (error instanceof BaseException) {
      const er = ErrorHandler.getErrorResponse(error);
      return res
        .status(er.statusCode)
        .json({ success: false, message: er.message, code: er.code, timestamp: er.timestamp });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}

export default LessonController;
