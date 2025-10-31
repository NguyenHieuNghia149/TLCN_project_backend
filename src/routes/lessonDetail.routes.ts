import { Router } from 'express';
import { LessonDetailController } from '@/controllers/lessonDetail.controller';
import { validate } from '@/middlewares/validate.middleware';
import { z } from 'zod';

const router = Router();
const lessonDetailController = new LessonDetailController();

// Validation schemas
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

// Routes
router.get(
  '/:id',
  validate(getLessonByIdSchema.params, 'params'),
  lessonDetailController.getLessonById
);

router.get(
  '/topic/:topicId',
  validate(getLessonsByTopicIdSchema.params, 'params'),
  lessonDetailController.getLessonsByTopicId
);

router.get(
  '/',
  lessonDetailController.getAllLessons
);

export default router;
