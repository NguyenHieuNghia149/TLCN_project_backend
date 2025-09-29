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
  PasswordResetSchema,
  SendVerificationEmailSchema,
} from '@/validations/auth.validation';
import { UserService } from '@/services/user.service';
import { EMailService } from '@/services/email.service';

const router = Router();
const authService = new AuthService();
const userService = new UserService();
const emailService = new EMailService();
const authController = new AuthController(authService, userService, emailService);

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

router.post(
  '/change-password',
  authenticationToken,
  validate(ChangePasswordSchema),
  authController.changePassword.bind(authController)
);
router.get('/me', authenticationToken, authController.getProfile.bind(authController));
router.put('/profile', authenticationToken, authController.updateProfile.bind(authController));

router.post(
  'reset-password',
  authRateLimit,
  validate(PasswordResetSchema),
  authController.resetPassword.bind(authController)
);

router.post(
  '/send-verification-email',
  validate(SendVerificationEmailSchema),
  authController.sendVerificationCode.bind(authController)
);

// Route kiểm tra trạng thái xác thực
router.get('/me', authenticationToken, (req: any, res) => {
  res.status(200).json({ user: req.user });
});

// Error handling middleware
router.use(AuthController.errorHandler);

export default router;
