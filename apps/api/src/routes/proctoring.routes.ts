import { Router } from 'express';

import { ProctoringController } from '@backend/api/controllers/proctoring.controller';
import { authenticationToken, optionalAuth } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { createProctoringBypassService } from '@backend/api/services/proctoring/proctoring-bypass.service';
import { createProctoringConsentService } from '@backend/api/services/proctoring/proctoring-consent.service';
import { createProctoringDataRequestService } from '@backend/api/services/proctoring/proctoring-data-request.service';
import { createProctoringFinalFlushService } from '@backend/api/services/proctoring/proctoring-final-flush.service';
import { createProctoringPrecheckService } from '@backend/api/services/proctoring/proctoring-precheck.service';
import { createProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';
import {
  CreateProctoringConsentSchema,
  CreateProctoringDataRequestSchema,
  CreateProctoringFinalFlushSchema,
  CreateProctoringPrecheckSchema,
  ProctoringParticipationIdParamsSchema,
  ProctoringSlugParamsSchema,
  VerifyProctoringBypassSchema,
} from '@backend/shared/validations/proctoring.validation';

export function createProctoringRouter(): Router {
  const router = Router();
  const controller = new ProctoringController({
    settingsService: createProctoringSettingsService(),
    consentService: createProctoringConsentService(),
    precheckService: createProctoringPrecheckService(),
    bypassService: createProctoringBypassService(),
    dataRequestService: createProctoringDataRequestService(),
    finalFlushService: createProctoringFinalFlushService(),
  });

  const proctoringLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many proctoring requests from this IP, please try again later.',
  });

  router.get(
    '/:slug/proctoring/settings',
    proctoringLimiter,
    optionalAuth,
    validate(ProctoringSlugParamsSchema, 'params'),
    controller.getSettings.bind(controller),
  );
  router.post(
    '/:slug/proctoring/consent',
    proctoringLimiter,
    authenticationToken,
    validate(ProctoringSlugParamsSchema, 'params'),
    validate(CreateProctoringConsentSchema),
    controller.acceptConsent.bind(controller),
  );
  router.post(
    '/:slug/proctoring/precheck',
    proctoringLimiter,
    authenticationToken,
    validate(ProctoringSlugParamsSchema, 'params'),
    validate(CreateProctoringPrecheckSchema),
    controller.createPrecheck.bind(controller),
  );
  router.post(
    '/:slug/proctoring/bypass/verify',
    proctoringLimiter,
    authenticationToken,
    validate(ProctoringSlugParamsSchema, 'params'),
    validate(VerifyProctoringBypassSchema),
    controller.verifyBypass.bind(controller),
  );
  router.post(
    '/participations/:participationId/proctoring/consent/withdraw',
    proctoringLimiter,
    authenticationToken,
    validate(ProctoringParticipationIdParamsSchema, 'params'),
    controller.withdrawConsent.bind(controller),
  );
  router.post(
    '/participations/:participationId/proctoring/final-flush',
    proctoringLimiter,
    authenticationToken,
    validate(ProctoringParticipationIdParamsSchema, 'params'),
    validate(CreateProctoringFinalFlushSchema),
    controller.submitFinalFlush.bind(controller),
  );
  router.post(
    '/participations/:participationId/proctoring/data-requests',
    proctoringLimiter,
    authenticationToken,
    validate(ProctoringParticipationIdParamsSchema, 'params'),
    validate(CreateProctoringDataRequestSchema),
    controller.createDataRequest.bind(controller),
  );

  return router;
}
