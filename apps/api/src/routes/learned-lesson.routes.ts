import { Router } from 'express';
import { LearnedLessonController } from '@backend/api/controllers/learned-lesson.controller';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { LearnedLessonService } from '@backend/api/services/learned-lesson.service';

/** Creates the learned-lesson router without constructing controllers at import time. */
export function createLearnedLessonRouter(): Router {
  const router = Router();
  const learnedLessonService = new LearnedLessonService();
  const learnedLessonController = new LearnedLessonController(learnedLessonService);

  const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 1000 });
  const mutateLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 300 });

  router.get(
    '/check/:lessonId',
    authenticationToken,
    generalLimit,
    learnedLessonController.checkLessonCompletion.bind(learnedLessonController)
  );
  router.get(
    '/user/completed',
    authenticationToken,
    generalLimit,
    learnedLessonController.getCompletedLessons.bind(learnedLessonController)
  );
  router.post(
    '/mark-completed',
    authenticationToken,
    mutateLimit,
    learnedLessonController.markLessonCompleted.bind(learnedLessonController)
  );

  return router;
}
