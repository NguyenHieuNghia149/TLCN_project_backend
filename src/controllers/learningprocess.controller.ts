import { Request, Response, NextFunction } from 'express';
import { LearningProcessService } from '@/services/learningprocess.service';

export class LearningProcessController {
  private learningProcessService: LearningProcessService;

  constructor() {
    this.learningProcessService = new LearningProcessService();
  }

  /**
   * Get user's complete learning progress
   */
  async getUserProgress(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      const progress = await this.learningProcessService.getUserLearningProgress(userId);

      return res.status(200).json({
        success: true,
        message: 'Learning progress fetched successfully',
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get progress for a specific topic
   */
  async getTopicProgress(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;
      const { topicId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      if (!topicId) {
        return res.status(400).json({
          success: false,
          message: 'Topic ID is required',
          code: 'INVALID_INPUT',
        });
      }

      const progress = await this.learningProcessService.getTopicProgress(userId, topicId);

      if (!progress) {
        return res.status(404).json({
          success: false,
          message: 'Topic not found',
          code: 'NOT_FOUND',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Topic progress fetched successfully',
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the most recent topic with submissions
   */
  async getRecentTopic(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      const recentTopic = await this.learningProcessService.getRecentTopic(userId);

      return res.status(200).json({
        success: true,
        message: 'Recent topic fetched successfully',
        data: recentTopic,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's complete lesson progress
   */
  async getUserLessonProgress(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      const progress = await this.learningProcessService.getUserLessonProgress(userId);

      return res.status(200).json({
        success: true,
        message: 'Lesson progress fetched successfully',
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
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

      const progress = await this.learningProcessService.getLessonProgress(userId, lessonId);

      if (!progress) {
        return res.status(404).json({
          success: false,
          message: 'Lesson not found',
          code: 'NOT_FOUND',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Lesson progress fetched successfully',
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the most recent lesson completed
   */
  async getRecentLesson(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'UNAUTHORIZED',
        });
      }

      const recentLesson = await this.learningProcessService.getRecentLesson(userId);

      return res.status(200).json({
        success: true,
        message: 'Recent lesson fetched successfully',
        data: recentLesson,
      });
    } catch (error) {
      next(error);
    }
  }
}
