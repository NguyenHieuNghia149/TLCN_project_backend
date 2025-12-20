import { Router } from 'express';
import { LessonDetailController } from '@/controllers/lessonDetail.controller';
import { validate } from '@/middlewares/validate.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { z } from 'zod';

const router = Router();
const lessonDetailController = new LessonDetailController();

// Rate limiting
const lessonDetailReadLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: 'Too many lesson requests, please try again later.',
});

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

router.get(
  '/',
  lessonDetailReadLimit,
  lessonDetailController.getAllLessons
);

export default router;
