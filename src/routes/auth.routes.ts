import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { AuthService } from '@/services/auth.service';
import { authenticationToken } from '@/middlewares/auth.middleware';
import {
  authLimiter,
  rateLimitMiddleware,
  strictLimiter,
} from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  LoginSchema,
  RegisterSchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
} from '@/validations/auth.validation';

const router = Router();
const authService = new AuthService();
const authController = new AuthController(authService);

const authRateLimit = authLimiter;
const strictRateLimit = strictLimiter;

router.post(
  '/register',
  strictRateLimit,
  validate(RegisterSchema),
  authController.register.bind(authController)
);
router.post(
  '/login',
  authRateLimit,
  validate(LoginSchema),
  authController.login.bind(authController)
);
router.post(
  '/refresh-token',
  authRateLimit,
  validate(RefreshTokenSchema),
  authController.refreshToken.bind(authController)
);

router.post('/logout', authenticationToken, authController.logout.bind(authController));
router.post('/logout-all', authenticationToken, authController.logoutAll.bind(authController));
router.post(
  '/change-password',
  authenticationToken,
  validate(ChangePasswordSchema),
  authController.changePassword.bind(authController)
);
router.get('/profile', authenticationToken, authController.getProfile.bind(authController));
router.put('/profile', authenticationToken, authController.updateProfile.bind(authController));

// Error handling middleware
router.use(AuthController.errorHandler);

export default router;
