import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import AdminLessonController from '@/controllers/admin/adminLesson.controller';
import LessonUploadController from '@/controllers/lesson-upload.controller';
import { CreateLessonSchema, UpdateLessonSchema } from '@/validations/lesson.validation';

const router = Router();
const controller = new AdminLessonController();
const uploadController = new LessonUploadController();

// Rate limiting
const adminReadLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: 'Too many read requests, please try again later.',
});

const adminMutateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many write requests, please try again later.',
});

const idSchema = z.object({ id: z.string().uuid('Invalid lesson ID') });

// Frontend has processed Word->HTML, only receive HTML via parse-content endpoint
router.post(
  '/parse-content',
  authenticationToken,
  requireTeacherOrOwner,
  adminMutateLimit,
  validate(z.object({ content: z.string() })),
  uploadController.parseContent
);

// CRUD routes
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

export default router;
