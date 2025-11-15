import { Request, Response, NextFunction } from 'express';
import { FavoriteService } from '@/services/favorite.service';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { FavoriteInput, FavoriteParams, LessonFavoriteInput, LessonFavoriteParams } from '@/validations/favorite.validation';
import { BaseException, ErrorHandler, UserNotFoundException } from '@/exceptions/auth.exceptions';

export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  async listFavorites(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException('User not found');
      }

      const favorites = await this.favoriteService.listUserFavorites(userId);

      res.status(200).json({
        success: true,
        data: favorites,
      });
    } catch (error) {
      next(error);
    }
  }

  async addFavorite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException('User not found');
      }

      const { problemId } = req.body as FavoriteInput;

      const favorite = await this.favoriteService.addFavorite(userId, problemId);

      res.status(201).json({
        success: true,
        message: 'Challenge bookmarked successfully',
        data: favorite,
      });
    } catch (error) {
      next(error);
    }
  }

  async removeFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException('User not found');
      }
      const { problemId } = req.params as FavoriteParams;

      await this.favoriteService.removeFavorite(userId, problemId);

      res.status(200).json({
        success: true,
        message: 'Challenge removed from bookmarks',
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException();
      }

      const { problemId } = req.params as FavoriteParams;

      const result = await this.favoriteService.toggleFavorite(userId, problemId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lesson favorite methods
  async listLessonFavorites(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException('User not found');
      }

      const favorites = await this.favoriteService.listUserLessonFavorites(userId);

      res.status(200).json({
        success: true,
        data: favorites,
      });
    } catch (error) {
      next(error);
    }
  }

  async addLessonFavorite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException('User not found');
      }

      const { lessonId } = req.body as LessonFavoriteInput;

      const favorite = await this.favoriteService.addLessonFavorite(userId, lessonId);

      res.status(201).json({
        success: true,
        message: 'Lesson bookmarked successfully',
        data: favorite,
      });
    } catch (error) {
      next(error);
    }
  }

  async removeLessonFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException('User not found');
      }
      const { lessonId } = req.params as LessonFavoriteParams;

      await this.favoriteService.removeLessonFavorite(userId, lessonId);

      res.status(200).json({
        success: true,
        message: 'Lesson removed from bookmarks',
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleLessonFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new UserNotFoundException();
      }

      const { lessonId } = req.params as LessonFavoriteParams;

      const result = await this.favoriteService.toggleLessonFavorite(userId, lessonId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
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
