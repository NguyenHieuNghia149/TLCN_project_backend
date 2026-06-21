import { Router } from 'express';
import { LessonController } from '../controllers/lesson.controller';
import { createLessonService } from '../services/lesson.service';
import { authenticationToken, requireTeacher, optionalAuth } from '../middlewares/auth.middleware';
import { rateLimitMiddleware } from '../middlewares/ratelimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  CreateLessonSchema,
  UpdateLessonSchema,
} from '@backend/shared/validations/lesson.validation';

/** Creates the lesson router without instantiating services at import time. */
export function createLessonRouter(): Router {
  const router = Router();
  const lessonService = createLessonService();
  const lessonController = new LessonController(lessonService);

  const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 1000 });
  const mutateLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 200 });

  router.get('/', optionalAuth, generalLimit, lessonController.list.bind(lessonController));
  router.get('/:lessonId', generalLimit, lessonController.getById.bind(lessonController));
  router.post(
    '/',
    authenticationToken,
    requireTeacher,
    mutateLimit,
    validate(CreateLessonSchema),
    lessonController.create.bind(lessonController)
  );
  router.put(
    '/:lessonId',
    authenticationToken,
    requireTeacher,
    mutateLimit,
    validate(UpdateLessonSchema),
    lessonController.update.bind(lessonController)
  );
  router.delete(
    '/:lessonId',
    authenticationToken,
    requireTeacher,
    mutateLimit,
    lessonController.delete.bind(lessonController)
  );

  return router;
}
