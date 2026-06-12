import { Router } from 'express';

import { AdminProctoringController } from '@backend/api/controllers/adminProctoring.controller';
import {
  authenticationToken,
  requireRole,
} from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { createProctoringAdminReviewService } from '@backend/api/services/proctoring/proctoring-admin-review.service';
import { createProctoringBypassService } from '@backend/api/services/proctoring/proctoring-bypass.service';
import { createProctoringSettingsService } from '@backend/api/services/proctoring/proctoring-settings.service';
import {
  AdminProctoringReviewQuerySchema,
  IssueProctoringBypassCodeSchema,
  ProctoringAdminBypassParamsSchema,
  ProctoringAdminReviewParamsSchema,
  ProctoringExamIdParamsSchema,
  RecomputeProctoringReviewSchema,
  ReviewProctoringDecisionSchema,
  UpdateProctoringSettingsSchema,
} from '@backend/shared/validations/proctoring.validation';

export function createAdminProctoringRouter(): Router {
  const router = Router();
  const controller = new AdminProctoringController({
    settingsService: createProctoringSettingsService(),
    bypassService: createProctoringBypassService(),
    reviewService: createProctoringAdminReviewService(),
  });

  const adminLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many admin proctoring requests from this IP, please try again later.',
  });
  const requireProctoringAdmin = requireRole(['owner', 'teacher', 'admin']);

  router.use(authenticationToken, requireProctoringAdmin, adminLimiter);

  router.post(
    '/:examId/participations/:participationId/proctoring/recompute',
    validate(ProctoringAdminReviewParamsSchema, 'params'),
    validate(RecomputeProctoringReviewSchema),
    controller.recompute.bind(controller),
  );
  router.post(
    '/:examId/participations/:participationId/proctoring/review',
    validate(ProctoringAdminReviewParamsSchema, 'params'),
    validate(ReviewProctoringDecisionSchema),
    controller.recordReviewDecision.bind(controller),
  );
  router.get(
    '/:examId/participations/:participationId/proctoring',
    validate(ProctoringAdminReviewParamsSchema, 'params'),
    validate(AdminProctoringReviewQuerySchema, 'query'),
    controller.getReview.bind(controller),
  );
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
