import { Request, Response, NextFunction } from 'express';
import { LearnedLessonService } from '@/services/learned-lesson.service';

export class LearnedLessonController {
  private learnedLessonService: LearnedLessonService;

  constructor() {
    this.learnedLessonService = new LearnedLessonService();
  }

  /**
   * Check if user has completed a lesson
   */
  async checkLessonCompletion(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;
      const { lessonId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      if (!lessonId) {
        return res.status(400).json({
          success: false,
          message: 'Lesson ID is required',
          code: 'INVALID_INPUT',
        });
      }

      const isCompleted = await this.learnedLessonService.hasUserCompletedLesson(userId, lessonId);

      return res.status(200).json({
        success: true,
        message: 'Lesson completion status fetched successfully',
        data: { isCompleted },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark lesson as completed
   */
  async markLessonCompleted(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;
      const { lessonId } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      if (!lessonId) {
        return res.status(400).json({
          success: false,
          message: 'Lesson ID is required',
          code: 'INVALID_INPUT',
        });
      }

      const success = await this.learnedLessonService.markLessonAsCompleted(userId, lessonId);

      return res.status(201).json({
        success,
        message: success ? 'Lesson marked as completed' : 'Failed to mark lesson as completed',
        code: success ? 'SUCCESS' : 'ERROR',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all completed lessons for user
   */
  async getCompletedLessons(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      const completedLessonIds = await this.learnedLessonService.getCompletedLessonsByUser(userId);

      return res.status(200).json({
        success: true,
        message: 'Completed lessons fetched successfully',
        data: { completedLessonIds },
      });
    } catch (error) {
      next(error);
    }
  }
}
