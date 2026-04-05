import { Router } from 'express';

import { ExamAccessController } from '@backend/api/controllers/examAccess.controller';
import { authenticationToken, optionalAuth } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { createExamAccessService } from '@backend/api/services/exam-access.service';
import { createExamService } from '@backend/api/services/exam.service';
import {
  ExamEntrySessionStartParamsSchema,
  ExamSessionSyncSchema,
  ExamSlugParamsSchema,
} from '@backend/shared/validations/exam-access.validation';

export function createExamAccessRouter(): Router {
  const router = Router();
  const controller = new ExamAccessController(createExamAccessService(), createExamService());

  const accessLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many exam access requests from this IP, please try again later.',
  });

  router.get(
    '/:slug/me/access-state',
    accessLimiter,
    optionalAuth,
    validate(ExamSlugParamsSchema, 'params'),
    controller.getAccessState.bind(controller),
  );
  router.post(
    '/entry-sessions/:id/start',
    accessLimiter,
    authenticationToken,
    validate(ExamEntrySessionStartParamsSchema, 'params'),
    controller.startEntrySession.bind(controller),
  );
  router.put(
    '/session/sync',
    accessLimiter,
    authenticationToken,
    validate(ExamSessionSyncSchema),
    controller.syncSession.bind(controller),
  );
  router.post(
    '/:slug/submit',
    accessLimiter,
    authenticationToken,
    validate(ExamSlugParamsSchema, 'params'),
    controller.submitExam.bind(controller),
  );

  return router;
}
