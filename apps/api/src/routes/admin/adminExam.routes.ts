import { Router } from 'express';

import { AdminExamController } from '@backend/api/controllers/adminExam.controller';
import {
  authenticationToken,
  requireTeacherOrOwner,
} from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { createExamAccessService } from '@backend/api/services/exam-access.service';
import {
  AdminExamAddParticipantsSchema,
  AdminExamBindAccountSchema,
  AdminExamListQuerySchema,
  AdminExamMergeParticipantsSchema,
  CreateAdminExamSchema,
  ExamIdParamsSchema,
  ExamParticipantParamsSchema,
  UpdateAdminExamSchema,
} from '@backend/shared/validations/exam-access.validation';

export function createAdminExamRouter(): Router {
  const router = Router();
  const controller = new AdminExamController(createExamAccessService());

  const adminLimiter = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many admin exam requests from this IP, please try again later.',
  });

  router.use(authenticationToken, requireTeacherOrOwner, adminLimiter);

  router.get('/', validate(AdminExamListQuerySchema, 'query'), controller.listExams.bind(controller));
  router.post('/', validate(CreateAdminExamSchema), controller.createExam.bind(controller));
  router.get('/:id', validate(ExamIdParamsSchema, 'params'), controller.getExamById.bind(controller));
  router.put('/:id', validate(ExamIdParamsSchema, 'params'), validate(UpdateAdminExamSchema), controller.updateExam.bind(controller));
  router.post(
    '/:id/publish',
    validate(ExamIdParamsSchema, 'params'),
    controller.publishExam.bind(controller),
  );
  router.get(
    '/:id/participants',
    validate(ExamIdParamsSchema, 'params'),
    controller.getParticipants.bind(controller),
  );
  router.post(
    '/:id/participants',
    validate(ExamIdParamsSchema, 'params'),
    validate(AdminExamAddParticipantsSchema),
    controller.addParticipants.bind(controller),
  );
  router.post(
    '/:id/participants/import',
    validate(ExamIdParamsSchema, 'params'),
    validate(AdminExamAddParticipantsSchema),
    controller.importParticipants.bind(controller),
  );
  router.post(
    '/:id/participants/:participantId/approve',
    validate(ExamParticipantParamsSchema, 'params'),
    controller.approveParticipant.bind(controller),
  );
  router.post(
    '/:id/participants/:participantId/reject',
    validate(ExamParticipantParamsSchema, 'params'),
    controller.rejectParticipant.bind(controller),
  );
  router.post(
    '/:id/participants/:participantId/revoke',
    validate(ExamParticipantParamsSchema, 'params'),
    controller.revokeParticipant.bind(controller),
  );
  router.post(
    '/:id/participants/:participantId/resend-invite',
    validate(ExamParticipantParamsSchema, 'params'),
    controller.resendInvite.bind(controller),
  );
  router.post(
    '/:id/participants/:participantId/bind-account',
    validate(ExamParticipantParamsSchema, 'params'),
    validate(AdminExamBindAccountSchema),
    controller.bindAccount.bind(controller),
  );
  router.post(
    '/:id/participants/merge',
    validate(ExamIdParamsSchema, 'params'),
    validate(AdminExamMergeParticipantsSchema),
    controller.mergeParticipants.bind(controller),
  );

  return router;
}
