import { Router } from 'express';
import { FavoriteController } from '@/controllers/favorite.controller';
import { FavoriteService } from '@/services/favorite.service';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { FavoriteInputSchema, FavoriteParamsSchema } from '@/validations/favorite.validation';

const router = Router();
const favoriteService = new FavoriteService();
const favoriteController = new FavoriteController(favoriteService);

const favoriteRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many favorite requests, please try again later.',
});

router.use(authenticationToken, favoriteRateLimit);

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
