import { Router } from 'express';
import { ExamController, CreateExamSchema } from '@backend/api/controllers/exam.controller';
import {
  JoinExamSchema,
  SubmitExamSchema,
  GetExamLeaderboardSchema,
  UpdateExamSchema,
} from '@backend/shared/validations/exam.validation';
import { ExamService } from '@backend/api/services/exam.service';
import { authenticationToken, requireTeacher } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';

/** Creates the exam router without instantiating services at import time. */
export function createExamRouter(): Router {
  const router = Router();
  const examService = new ExamService();
  const examController = new ExamController(examService);

  const examRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many exam requests from this IP, please try again later.',
  });

  const examSessionLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many exam session requests from this IP, please try again later.',
  });

  const createExamRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many exam creation requests from this IP, please try again later.',
  });

  router.get('/', examRateLimit, examController.getExams.bind(examController));
  router.get('/:id', examRateLimit, examController.getExamById.bind(examController));
  router.get(
    '/:examId/challenge/:challengeId',
    examRateLimit,
    examController.getExamChallenge.bind(examController)
  );

  router.post(
    '/:id/join',
    authenticationToken,
    examRateLimit,
    validate(JoinExamSchema),
    examController.joinExam.bind(examController)
  );

  router.post(
    '/:id/submit',
    authenticationToken,
    examRateLimit,
    validate(SubmitExamSchema),
    examController.submitExam.bind(examController)
  );

  router.get(
    '/:id/leaderboard',
    authenticationToken,
    examRateLimit,
    examController.getLeaderboard.bind(examController)
  );

  router.get(
    '/:examId/leaderboard',
    examRateLimit,
    validate(GetExamLeaderboardSchema),
    examController.getExamLeaderboard.bind(examController)
  );

  router.post(
    '/join',
    authenticationToken,
    examRateLimit,
    validate(JoinExamSchema),
    examController.joinExam.bind(examController)
  );

  router.post(
    '/submit',
    authenticationToken,
    examRateLimit,
    validate(SubmitExamSchema),
    examController.submitExam.bind(examController)
  );

  router.get(
    '/:examId/participation/me',
    authenticationToken,
    examRateLimit,
    examController.getMyParticipation.bind(examController)
  );

  router.get(
    '/:examId/session',
    authenticationToken,
    examRateLimit,
    examController.getOrCreateSession.bind(examController)
  );

  router.get(
    '/:examId/participation/:participationId/submission',
    authenticationToken,
    examRateLimit,
    examController.getParticipationSubmission.bind(examController)
  );

  router.get(
    '/:examId/participation/:participationId',
    authenticationToken,
    examRateLimit,
    examController.getParticipation.bind(examController)
  );

  router.put(
    '/session/sync',
    authenticationToken,
    examSessionLimit,
    examController.syncSession.bind(examController)
  );

  router.post(
    '/',
    authenticationToken,
    requireTeacher,
    createExamRateLimit,
    validate(CreateExamSchema),
    validate(CreateExamSchema),
    examController.createExam.bind(examController)
  );

  router.put(
    '/:id',
    authenticationToken,
    requireTeacher,
    validate(UpdateExamSchema),
    examController.updateExam.bind(examController)
  );

  router.delete(
    '/:id',
    authenticationToken,
    requireTeacher,
    examController.deleteExam.bind(examController)
  );

  return router;
}
