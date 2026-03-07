import { Request, Response, NextFunction } from 'express';
import { LearnedLessonService } from '@/services/learned-lesson.service';
import { AppException } from '@/exceptions/base.exception';

export class LearnedLessonController {
  private learnedLessonService: LearnedLessonService;

  constructor() {
    this.learnedLessonService = new LearnedLessonService();
  }

  /**
   * Check if user has completed a lesson
   */
  async checkLessonCompletion(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    const { lessonId } = req.params;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'INVALID_INPUT');
    }

    const isCompleted = await this.learnedLessonService.hasUserCompletedLesson(userId, lessonId);

    res.status(200).json({ isCompleted });
  }

  /**
   * Mark lesson as completed
   */
  async markLessonCompleted(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    const { lessonId } = req.body;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'INVALID_INPUT');
    }

    const success = await this.learnedLessonService.markLessonAsCompleted(userId, lessonId);

    if (!success) {
      throw new AppException('Failed to mark lesson as completed', 500, 'ERROR');
    }

    res.status(201).json({
      message: 'Lesson marked as completed',
    });
  }

  /**
   * Get all completed lessons for user
   */
  async getCompletedLessons(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const completedLessonIds = await this.learnedLessonService.getCompletedLessonsByUser(userId);

    res.status(200).json({ completedLessonIds });
  }
}
