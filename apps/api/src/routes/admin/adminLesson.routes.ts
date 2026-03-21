import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import AdminLessonController from '@backend/api/controllers/admin/adminLesson.controller';
import LessonUploadController from '@backend/api/controllers/lesson-upload.controller';
import { AdminLessonService } from '@backend/api/services/admin/adminLesson.service';
import {
  CreateLessonSchema,
  UpdateLessonSchema,
} from '@backend/shared/validations/lesson.validation';

/** Creates the admin-lesson router without constructing controllers at import time. */
export function createAdminLessonRouter(): Router {
  const router = Router();
  const adminLessonService = new AdminLessonService();
  const controller = new AdminLessonController(adminLessonService);
  const uploadController = new LessonUploadController();

  const adminReadLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many read requests, please try again later.',
  });

  const adminMutateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many write requests, please try again later.',
  });

  const idSchema = z.object({ id: z.string().uuid('Invalid lesson ID') });

  router.post(
    '/parse-content',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(z.object({ content: z.string() })),
    uploadController.parseContent
  );

  router.get('/', authenticationToken, requireTeacherOrOwner, adminReadLimit, controller.list);
  router.get(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(idSchema, 'params'),
    controller.getById
  );
  router.post(
    '/',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(CreateLessonSchema),
    controller.create
  );
  router.put(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    validate(UpdateLessonSchema.partial()),
    controller.update
  );
  router.delete(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    controller.remove
  );

  return router;
}
