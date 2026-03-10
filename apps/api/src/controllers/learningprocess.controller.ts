import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { LearningProcessService } from '@backend/api/services/learningprocess.service';
import { AppException } from '@backend/api/exceptions/base.exception';

export class LearningProcessController {
  private learningProcessService: LearningProcessService;

  constructor() {
    this.learningProcessService = new LearningProcessService();
  }

  /**
   * Get user's complete learning progress
   */
  async getUserProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'USER_ID_REQUIRED');
    }

    const progress = await this.learningProcessService.getUserLearningProgress(userId);

    res.status(200).json(progress);
  }

  /**
   * Get progress for a specific topic
   */
  async getTopicProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;
    const { topicId } = req.params;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'USER_ID_REQUIRED');
    }

    if (!topicId) {
      throw new AppException('Topic ID is required', 400, 'TOPIC_ID_REQUIRED');
    }

    const progress = await this.learningProcessService.getTopicProgress(userId, topicId as string);

    if (!progress) {
      throw new AppException('Topic not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(progress);
  }

  /**
   * Get the most recent topic with submissions
   */
  async getRecentTopic(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'USER_ID_REQUIRED');
    }

    const recentTopic = await this.learningProcessService.getRecentTopic(userId);

    res.status(200).json(recentTopic);
  }

  /**
   * Get user's complete lesson progress
   */
  async getUserLessonProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'USER_ID_REQUIRED');
    }

    const progress = await this.learningProcessService.getUserLessonProgress(userId);

    res.status(200).json(progress);
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;
    const { lessonId } = req.params;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'USER_ID_REQUIRED');
    }

    if (!lessonId) {
      throw new AppException('Lesson ID is required', 400, 'LESSON_ID_REQUIRED');
    }

    const progress = await this.learningProcessService.getLessonProgress(
      userId,
      lessonId as string
    );

    if (!progress) {
      throw new AppException('Lesson not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(progress);
  }

  /**
   * Get the most recent lesson completed
   */
  async getRecentLesson(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'USER_ID_REQUIRED');
    }

    const recentLesson = await this.learningProcessService.getRecentLesson(userId);

    res.status(200).json(recentLesson);
  }
}
