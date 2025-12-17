import { Router } from 'express';
import { ExamController, CreateExamSchema } from '@/controllers/exam.controller';
import {
  JoinExamSchema,
  SubmitExamSchema,
  GetExamLeaderboardSchema,
  UpdateExamSchema,
} from '@/validations/exam.validation';
import { ExamService } from '@/services/exam.service';
import { authenticationToken, requireTeacher } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';

const router = Router();
const examService = new ExamService();
const examController = new ExamController(examService);

// Rate limiting
const examRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many exam requests from this IP, please try again later.',
});

const examSessionLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many exam session requests from this IP, please try again later.',
});

const createExamRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 10 exam creation requests per windowMs
  message: 'Too many exam creation requests from this IP, please try again later.',
});

// Public routes
router.get('/', examRateLimit, examController.getExams.bind(examController));
router.get('/:id', examRateLimit, examController.getExamById.bind(examController));
router.get(
  '/:examId/challenge/:challengeId',
  examRateLimit,
  examController.getExamChallenge.bind(examController)
);

// Join exam (requires auth)
router.post(
  '/:id/join',
  authenticationToken,
  examRateLimit,
  validate(JoinExamSchema),
  examController.joinExam.bind(examController)
);

// Submit exam (requires auth)
router.post(
  '/:id/submit',
  authenticationToken,
  examRateLimit,
  validate(SubmitExamSchema),
  examController.submitExam.bind(examController)
);

// Leaderboard (requires auth)
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

// Protected routes (require authentication)
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

// Get current authenticated user's participation for an exam
router.get(
  '/:examId/participation/me',
  authenticationToken,
  examRateLimit,
  examController.getMyParticipation.bind(examController)
);

// Get or create live exam session (resume/start)
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

// Get participation by ID (requires auth)
// This route was missing and causes 404 when frontend calls /exams/:examId/participation/:id
router.get(
  '/:examId/participation/:participationId',
  authenticationToken,
  examRateLimit,
  examController.getParticipation.bind(examController)
);

// Sync session progress
router.put(
  '/session/sync',
  authenticationToken,
  examSessionLimit,
  examController.syncSession.bind(examController)
);

// Protected routes (require authentication and teacher role)
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

// Error handling middleware (must be last)
router.use(ExamController.errorHandler);

export default router;
