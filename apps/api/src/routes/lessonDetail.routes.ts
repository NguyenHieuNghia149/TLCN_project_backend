import { Router } from 'express';
import { LessonDetailController } from '@backend/api/controllers/lessonDetail.controller';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { z } from 'zod';

/** Creates the lesson-detail router without constructing controllers at import time. */
export function createLessonDetailRouter(): Router {
  const router = Router();
  const lessonDetailController = new LessonDetailController();

  const lessonDetailReadLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many lesson requests, please try again later.',
  });

  const getLessonByIdSchema = {
    params: z.object({
      id: z.string().uuid('Invalid lesson ID format'),
    }),
  };

  const getLessonsByTopicIdSchema = {
    params: z.object({
      topicId: z.string().uuid('Invalid topic ID format'),
    }),
  };

  router.get(
    '/:id',
    lessonDetailReadLimit,
    validate(getLessonByIdSchema.params, 'params'),
    lessonDetailController.getLessonById
  );
  router.get(
    '/topic/:topicId',
    lessonDetailReadLimit,
    validate(getLessonsByTopicIdSchema.params, 'params'),
    lessonDetailController.getLessonsByTopicId
  );
  router.get('/', lessonDetailReadLimit, lessonDetailController.getAllLessons);

  return router;
}
