import { Request, Response, NextFunction } from 'express';
import { LessonService } from '../services/lesson.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  CreateLessonSchema,
  UpdateLessonSchema,
} from '@backend/shared/validations/lesson.validation';
import { AppException } from '@/exceptions/base.exception';

export class LessonController {
  constructor(private readonly lessonService: LessonService) {}

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const userId = req.user?.userId;
    const topicId = req.query.topicId as string | undefined;
    const result = await this.lessonService.getAllLessons(userId, topicId);
    res.status(200).json(result);
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const lessonId = req.params.lessonId;

    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'MISSING_LESSON_ID');
    }
    const result = await this.lessonService.getLessonById(lessonId as string);
    res.status(200).json(result);
  }

  async create(req: Request, res: Response, next: NextFunction) {
    const { title, content, videoUrl, topicId } = CreateLessonSchema.parse(req.body);
    const result = await this.lessonService.createLesson({ title, content, videoUrl, topicId });
    res.status(201).json({ message: 'Lesson created', ...result });
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { lessonId } = req.params;
    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'MISSING_LESSON_ID');
    }
    const parsedData = UpdateLessonSchema.parse(req.body);
    const result = await this.lessonService.updateLesson(lessonId as string, parsedData);
    res.status(200).json({ message: 'Lesson updated', ...result });
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { lessonId } = req.params;
    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'MISSING_LESSON_ID');
    }
    await this.lessonService.deleteLesson(lessonId as string);
    res.status(200).json({ message: 'Lesson deleted' });
  }
}

export default LessonController;
