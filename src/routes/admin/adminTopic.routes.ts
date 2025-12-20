import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { AdminTopicController } from '@/controllers/admin/adminTopic.controller';
import { CreateTopicSchema, UpdateTopicSchema } from '@/validations/topic.validation';

const router = Router();
const controller = new AdminTopicController();

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

const idSchema = z.object({ id: z.string().uuid('Invalid topic ID') });

// CRUD routes
router.get('/', authenticationToken, requireTeacherOrOwner, adminReadLimit, controller.list);
router.get('/:id', authenticationToken, requireTeacherOrOwner, adminReadLimit, validate(idSchema, 'params'), controller.getById);
router.post('/', authenticationToken, requireTeacherOrOwner, adminMutateLimit, validate(CreateTopicSchema), controller.create);
router.put('/:id', authenticationToken, requireTeacherOrOwner, adminMutateLimit, validate(idSchema, 'params'), validate(UpdateTopicSchema.partial()), controller.update);
router.delete('/:id', authenticationToken, requireTeacherOrOwner, adminMutateLimit, validate(idSchema, 'params'), controller.delete);
router.get('/:id/stats', authenticationToken, requireTeacherOrOwner, adminReadLimit, validate(idSchema, 'params'), controller.getStats);

export default router;
