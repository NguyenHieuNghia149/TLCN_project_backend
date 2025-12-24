import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { AuthService } from '@/services/auth.service';
import { authenticationToken, requireTeacher } from '@/middlewares/auth.middleware';
import {
  authLimiter,
  rateLimitMiddleware,
  refreshLimiter,
  strictLimiter,
} from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  LoginSchema,
  RegisterSchema,
  ChangePasswordSchema,
  PasswordResetSchema,
  SendVerificationEmailSchema,
  GoogleLoginSchema,
  VerifyOTPSchema,
} from '@/validations/auth.validation';
import { upload } from '@/middlewares/upload.middleware';
import { UserService } from '@/services/user.service';
import { EMailService } from '@/services/email.service';

const router = Router();
const authService = new AuthService();
const userService = new UserService();
const emailService = new EMailService();
const authController = new AuthController(authService, userService, emailService);

const authRateLimit = authLimiter;
const strictRateLimit = strictLimiter;
const refreshLimit = refreshLimiter;

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
  '/google',
  authRateLimit,
  validate(GoogleLoginSchema),
  authController.googleLogin.bind(authController)
);
router.post('/refresh-token', authRateLimit, authController.refreshToken.bind(authController));

router.post('/logout', authController.logout.bind(authController));

router.post(
  '/change-password',
  authenticationToken,
  validate(ChangePasswordSchema),
  authController.changePassword.bind(authController)
);
// Profile routes
router.get('/me', authenticationToken, authController.getProfile.bind(authController));

router.get(
  '/profile/:userId',
  authenticationToken,
  authController.getProfileById.bind(authController)
);
router.put('/profile', authenticationToken, authController.updateProfile.bind(authController));
router.post(
  '/profile/upload-avatar',
  authenticationToken,
  upload.single('avatar'),
  authController.uploadAvatar.bind(authController)
);

router.post(
  '/reset-password',
  refreshLimit,
  validate(PasswordResetSchema),
  authController.resetPassword.bind(authController)
);

router.post(
  '/send-verification-email',
  authRateLimit,
  validate(SendVerificationEmailSchema),
  authController.sendVerificationCode.bind(authController)
);

router.post(
  '/send-reset-otp',
  authRateLimit,
  validate(SendVerificationEmailSchema),
  authController.sendResetOTP.bind(authController)
);
router.post(
  '/verify-otp',
  authRateLimit,
  validate(VerifyOTPSchema),
  authController.verifyOTP.bind(authController)
);

router.get('/health', authRateLimit, (req, res) => {
  res.json({ status: 'ok' });
});
// Error handling middleware
router.use(AuthController.errorHandler);

export default router;
