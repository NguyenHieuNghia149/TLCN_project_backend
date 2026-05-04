import { Router } from 'express';

import { PublicExamController } from '@backend/api/controllers/examAccess.controller';
import { optionalAuth } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { createExamAccessService } from '@backend/api/services/exam-access.service';
import {
  ExamSlugParamsSchema,
  PublicExamInviteResolveSchema,
  PublicExamOtpSendSchema,
  PublicExamOtpVerifySchema,
  PublicExamRegisterSchema,
} from '@backend/shared/validations/exam-access.validation';

export function createPublicExamRouter(): Router {
  const router = Router();
  const controller = new PublicExamController(createExamAccessService());

  const publicExamLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many public exam requests from this IP, please try again later.',
  });

  router.get(
    '/:slug',
    publicExamLimiter,
    validate(ExamSlugParamsSchema, 'params'),
    controller.getPublicExam.bind(controller),
  );
  router.post(
    '/:slug/register',
    publicExamLimiter,
    optionalAuth,
    validate(ExamSlugParamsSchema, 'params'),
    validate(PublicExamRegisterSchema),
    controller.register.bind(controller),
  );
  router.post(
    '/:slug/invites/resolve',
    publicExamLimiter,
    optionalAuth,
    validate(ExamSlugParamsSchema, 'params'),
    validate(PublicExamInviteResolveSchema),
    controller.resolveInvite.bind(controller),
  );
  router.post(
    '/:slug/otp/send',
    publicExamLimiter,
    validate(ExamSlugParamsSchema, 'params'),
    validate(PublicExamOtpSendSchema),
    controller.sendOtp.bind(controller),
  );
  router.post(
    '/:slug/otp/verify',
    publicExamLimiter,
    validate(ExamSlugParamsSchema, 'params'),
    validate(PublicExamOtpVerifySchema),
    controller.verifyOtp.bind(controller),
  );

  return router;
}
