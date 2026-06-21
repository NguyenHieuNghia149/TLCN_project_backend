import { Request, Response, NextFunction } from 'express';
import { FavoriteService } from '@backend/api/services/favorite.service';
import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import {
  FavoriteInput,
  FavoriteParams,
  LessonFavoriteInput,
  LessonFavoriteParams,
} from '@backend/shared/validations/favorite.validation';
import { UserNotFoundException } from '@backend/api/exceptions/auth.exceptions';

export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  async listFavorites(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException('User not found');
    }

    const favorites = await this.favoriteService.listUserFavorites(userId);

    res.status(200).json(favorites);
  }

  async addFavorite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException('User not found');
    }

    const { problemId } = req.body as FavoriteInput;

    const favorite = await this.favoriteService.addFavorite(userId, problemId);

    res.status(201).json({
      message: 'Challenge bookmarked successfully',
      ...favorite,
    });
  }

  async removeFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException('User not found');
    }
    const { problemId } = req.params as FavoriteParams;

    await this.favoriteService.removeFavorite(userId, problemId);

    res.status(200).json({
      message: 'Challenge removed from bookmarks',
    });
  }

  async toggleFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException();
    }

    const { problemId } = req.params as FavoriteParams;

    const result = await this.favoriteService.toggleFavorite(userId, problemId);

    res.status(200).json({
      ...result,
      message: result.message,
    });
  }

  // Lesson favorite methods
  async listLessonFavorites(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException('User not found');
    }

    const favorites = await this.favoriteService.listUserLessonFavorites(userId);

    res.status(200).json(favorites);
  }

  async addLessonFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException('User not found');
    }

    const { lessonId } = req.body as LessonFavoriteInput;

    const favorite = await this.favoriteService.addLessonFavorite(userId, lessonId);

    res.status(201).json({
      message: 'Lesson bookmarked successfully',
      ...favorite,
    });
  }

  async removeLessonFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException('User not found');
    }
    const { lessonId } = req.params as LessonFavoriteParams;

    await this.favoriteService.removeLessonFavorite(userId, lessonId);

    res.status(200).json({
      message: 'Lesson removed from bookmarks',
    });
  }

  async toggleLessonFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;

    if (!userId) {
      throw new UserNotFoundException();
    }

    const { lessonId } = req.params as LessonFavoriteParams;

    const result = await this.favoriteService.toggleLessonFavorite(userId, lessonId);

    res.status(200).json({
      ...result,
      message: result.message,
    });
  }
}
