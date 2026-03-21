import { Router } from 'express';
import { LearningProcessController } from '@backend/api/controllers/learningprocess.controller';
import { authenticationToken } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { createLearningProcessService } from '@backend/api/services/learningprocess.service';

/** Creates the learning-process router without constructing controllers at import time. */
export function createLearningProcessRouter(): Router {
  const router = Router();
  const learningProcessService = createLearningProcessService();
  const learningProcessController = new LearningProcessController(learningProcessService);

  const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 1000 });

  router.get(
    '/user/progress',
    authenticationToken,
    generalLimit,
    learningProcessController.getUserProgress.bind(learningProcessController)
  );
  router.get(
    '/topic/:topicId',
    authenticationToken,
    generalLimit,
    learningProcessController.getTopicProgress.bind(learningProcessController)
  );
  router.get(
    '/user/recent',
    authenticationToken,
    generalLimit,
    learningProcessController.getRecentTopic.bind(learningProcessController)
  );
  router.get(
    '/lessons/user/progress',
    authenticationToken,
    generalLimit,
    learningProcessController.getUserLessonProgress.bind(learningProcessController)
  );
  router.get(
    '/lessons/:lessonId',
    authenticationToken,
    generalLimit,
    learningProcessController.getLessonProgress.bind(learningProcessController)
  );
  router.get(
    '/lessons/user/recent',
    authenticationToken,
    generalLimit,
    learningProcessController.getRecentLesson.bind(learningProcessController)
  );

  return router;
}
