import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { LearningProcessService } from '@/services/learningprocess.service';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';

export class LearningProcessController {
  private learningProcessService: LearningProcessService;

  constructor() {
    this.learningProcessService = new LearningProcessService();
  }

  /**
   * Get user's complete learning progress
   */
  async getUserProgress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new BaseException('User ID is required', 400, 'USER_ID_REQUIRED');
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
  async getTopicProgress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = req.user?.userId;
      const { topicId } = req.params;

      if (!userId) {
        throw new BaseException('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      if (!topicId) {
        throw new BaseException('Topic ID is required', 400, 'TOPIC_ID_REQUIRED');
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
  async getRecentTopic(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new BaseException('User ID is required', 400, 'USER_ID_REQUIRED');
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
  async getUserLessonProgress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new BaseException('User ID is required', 400, 'USER_ID_REQUIRED');
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
  async getLessonProgress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = req.user?.userId;
      const { lessonId } = req.params;

      if (!userId) {
        throw new BaseException('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      if (!lessonId) {
        throw new BaseException('Lesson ID is required', 400, 'LESSON_ID_REQUIRED');
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
  async getRecentLesson(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new BaseException('User ID is required', 400, 'USER_ID_REQUIRED');
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

  /**
   * Error handling middleware for learning process endpoints
   */
  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle custom exceptions
    if (error instanceof BaseException) {
      const errorResponse = ErrorHandler.getErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: errorResponse.timestamp,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}
