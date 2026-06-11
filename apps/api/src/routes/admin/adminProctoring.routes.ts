import { Router } from 'express';

import { AdminProctoringController } from '@backend/api/controllers/adminProctoring.controller';
import {
  authenticationToken,
  requireTeacherOrOwner,
} from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { createProctoringBypassService } from '@backend/api/services/proctoring/proctoring-bypass.service';
import { createProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';
import {
  IssueProctoringBypassCodeSchema,
  ProctoringAdminBypassParamsSchema,
  ProctoringExamIdParamsSchema,
  UpdateProctoringSettingsSchema,
} from '@backend/shared/validations/proctoring.validation';

export function createAdminProctoringRouter(): Router {
  const router = Router();
  const controller = new AdminProctoringController({
    settingsService: createProctoringSettingsService(),
    bypassService: createProctoringBypassService(),
  });

  const adminLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many admin proctoring requests from this IP, please try again later.',
  });

  router.use(authenticationToken, requireTeacherOrOwner, adminLimiter);

  router.post(
    '/:examId/proctoring/settings',
    validate(ProctoringExamIdParamsSchema, 'params'),
    validate(UpdateProctoringSettingsSchema),
    controller.updateSettings.bind(controller),
  );
  router.post(
    '/:examId/participations/:participationId/proctoring/bypass-codes',
    validate(ProctoringAdminBypassParamsSchema, 'params'),
    validate(IssueProctoringBypassCodeSchema),
    controller.issueBypassCode.bind(controller),
  );

  return router;
}
