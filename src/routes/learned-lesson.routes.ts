import { Router } from 'express';
import { LearnedLessonController } from '@/controllers/learned-lesson.controller';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';

const router = Router();
const learnedLessonController = new LearnedLessonController();

const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 1000 });
const mutateLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 300 });

// Check if user has completed a lesson
router.get(
  '/check/:lessonId',
  authenticationToken,
  generalLimit,
  learnedLessonController.checkLessonCompletion.bind(learnedLessonController)
);

// Get all completed lessons for user
router.get(
  '/user/completed',
  authenticationToken,
  generalLimit,
  learnedLessonController.getCompletedLessons.bind(learnedLessonController)
);

// Mark lesson as completed
router.post(
  '/mark-completed',
  authenticationToken,
  mutateLimit,
  learnedLessonController.markLessonCompleted.bind(learnedLessonController)
);

export default router;
