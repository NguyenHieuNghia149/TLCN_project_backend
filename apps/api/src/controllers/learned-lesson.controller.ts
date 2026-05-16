import { Request, Response, NextFunction } from 'express';
import { successResponse } from '@backend/shared/utils/response';
import { LearnedLessonService } from '@backend/api/services/learned-lesson.service';
import { AppException } from '@backend/api/exceptions/base.exception';

export class LearnedLessonController {
  constructor(private readonly learnedLessonService: LearnedLessonService) {}

  /**
   * Check if user has completed a lesson
   */
  async checkLessonCompletion(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    const { lessonId } = req.params;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'INVALID_INPUT');
    }

    const isCompleted = await this.learnedLessonService.hasUserCompletedLesson(
      userId,
      lessonId as string
    );

    res.status(200).json(successResponse({ isCompleted }));
  }

  /**
   * Mark lesson as completed.
   * Optional `roadmapId` in body scopes the update to that roadmap only.
   */
  async markLessonCompleted(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    const { lessonId, roadmapId } = req.body;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'INVALID_INPUT');
    }

    const success = await this.learnedLessonService.markLessonAsCompleted(
      userId,
      lessonId,
      roadmapId ?? undefined
    );

    if (!success) {
      throw new AppException('Failed to mark lesson as completed', 500, 'ERROR');
    }

    res.status(201).json(successResponse({ message: 'Lesson marked as completed' }));
  }


  /**
   * Get all completed lessons for user
   */
  async getCompletedLessons(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AppException('User not authenticated', 401, 'UNAUTHORIZED');
    }

    const completedLessonIds = await this.learnedLessonService.getCompletedLessonsByUser(userId);

    res.status(200).json(successResponse({ completedLessonIds }));
  }
}
