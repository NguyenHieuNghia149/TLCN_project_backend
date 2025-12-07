import { Router } from 'express';
import { FavoriteController } from '@/controllers/favorite.controller';
import { FavoriteService } from '@/services/favorite.service';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  FavoriteInputSchema,
  FavoriteParamsSchema,
  LessonFavoriteInputSchema,
  LessonFavoriteParamsSchema,
} from '@/validations/favorite.validation';

const router = Router();
const favoriteService = new FavoriteService();
const favoriteController = new FavoriteController(favoriteService);

const favoriteRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many favorite requests, please try again later.',
});

router.use(authenticationToken, favoriteRateLimit);

// Lesson favorite endpoints (must be before generic :id routes)
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

// Toggle lesson favorite - thêm hoặc xóa yêu thích
router.put(
  '/lesson/:lessonId/toggle',
  validate(LessonFavoriteParamsSchema, 'params'),
  favoriteController.toggleLessonFavorite.bind(favoriteController)
);

// Problem favorite endpoints
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

// Toggle favorite - thêm hoặc xóa yêu thích
router.put(
  '/:problemId/toggle',
  validate(FavoriteParamsSchema, 'params'),
  favoriteController.toggleFavorite.bind(favoriteController)
);

// Error handling middleware
router.use(FavoriteController.errorHandler);

export default router;
