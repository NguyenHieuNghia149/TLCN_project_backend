import { Router } from 'express';
import { LessonController } from '../controllers/lesson.controller';
import { LessonService } from '../services/lesson.service';
import { authenticationToken, requireTeacher } from '../middlewares/auth.middleware';
import { rateLimitMiddleware } from '../middlewares/ratelimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { CreateLessonSchema, UpdateLessonSchema } from '../validations/lesson.validation';

const router = Router();
const lessonService = new LessonService();
const lessonController = new LessonController(lessonService);

const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 });
const mutateLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 });

router.get('/', generalLimit, lessonController.list.bind(lessonController));

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

router.use(LessonController.errorHandler);

export default router;
