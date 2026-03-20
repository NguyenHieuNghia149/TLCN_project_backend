import { Router } from 'express';
import { FavoriteController } from '@backend/api/controllers/favorite.controller';
import { FavoriteService } from '@backend/api/services/favorite.service';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import {
  FavoriteInputSchema,
  FavoriteParamsSchema,
  LessonFavoriteInputSchema,
  LessonFavoriteParamsSchema,
} from '@backend/shared/validations/favorite.validation';

/** Creates the favorite router without instantiating services at import time. */
export function createFavoriteRouter(): Router {
  const router = Router();
  const favoriteService = new FavoriteService();
  const favoriteController = new FavoriteController(favoriteService);

  const favoriteRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: 'Too many favorite requests, please try again later.',
  });

  router.use(authenticationToken, favoriteRateLimit);

  router.get('/lessons', favoriteController.listLessonFavorites.bind(favoriteController));
  router.post(
    '/lesson',
    validate(LessonFavoriteInputSchema),
    favoriteController.addLessonFavorite.bind(favoriteController)
  );
  router.delete(
    '/lesson/:lessonId',
    validate(LessonFavoriteParamsSchema, 'params'),
    favoriteController.removeLessonFavorite.bind(favoriteController)
  );
  router.put(
    '/lesson/:lessonId/toggle',
    validate(LessonFavoriteParamsSchema, 'params'),
    favoriteController.toggleLessonFavorite.bind(favoriteController)
  );

  router.get('/', favoriteController.listFavorites.bind(favoriteController));
  router.post(
    '/',
    validate(FavoriteInputSchema),
    favoriteController.addFavorite.bind(favoriteController)
  );
  router.delete(
    '/:problemId',
    validate(FavoriteParamsSchema, 'params'),
    favoriteController.removeFavorite.bind(favoriteController)
  );
  router.put(
    '/:problemId/toggle',
    validate(FavoriteParamsSchema, 'params'),
    favoriteController.toggleFavorite.bind(favoriteController)
  );

  return router;
}
