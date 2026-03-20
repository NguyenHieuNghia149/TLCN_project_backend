import { Router } from 'express';
import { AuthController } from '@backend/api/controllers/auth.controller';
import { AuthService } from '@backend/api/services/auth.service';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import {
  authLimiter,
  refreshLimiter,
  strictLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
} from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import {
  LoginSchema,
  RegisterSchema,
  ChangePasswordSchema,
  PasswordResetSchema,
  SendVerificationEmailSchema,
  GoogleLoginSchema,
  VerifyOTPSchema,
} from '@backend/shared/validations/auth.validation';
import { upload } from '@backend/api/middlewares/upload.middleware';
import { UserService } from '@backend/api/services/user.service';
import { EMailService } from '@backend/api/services/email.service';

/** Creates the auth router without building controllers and services at import time. */
export function createAuthRouter(): Router {
  const router = Router();
  const authService = new AuthService();
  const userService = new UserService();
  const emailService = new EMailService();
  const authController = new AuthController(authService, userService, emailService);

  const authRateLimit = authLimiter;
  const strictRateLimit = strictLimiter;
  const passwordResetLimit = passwordResetLimiter;
  const emailVerificationLimit = emailVerificationLimiter;

  router.post(
    '/register',
    strictRateLimit,
    validate(RegisterSchema),
    authController.register.bind(authController)
  );
  router.post('/login', authRateLimit, validate(LoginSchema), authController.login.bind(authController));
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
    passwordResetLimit,
    validate(PasswordResetSchema),
    authController.resetPassword.bind(authController)
  );

  router.post(
    '/send-verification-email',
    emailVerificationLimit,
    validate(SendVerificationEmailSchema),
    authController.sendVerificationCode.bind(authController)
  );

  router.post(
    '/send-reset-otp',
    passwordResetLimit,
    validate(SendVerificationEmailSchema),
    authController.sendResetOTP.bind(authController)
  );
  router.post(
    '/verify-otp',
    passwordResetLimit,
    validate(VerifyOTPSchema),
    authController.verifyOTP.bind(authController)
  );

  router.get('/health', authRateLimit, (req, res) => {
    res.json({ status: 'ok' });
  });

  return router;
}
