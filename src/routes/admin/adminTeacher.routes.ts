import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireOwner } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import AdminTeacherController from '@/controllers/admin/adminTeacher.controller';
import { z } from 'zod';

const router = Router();
const controller = new AdminTeacherController();

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

const idSchema = z.object({ id: z.string().uuid('Invalid user ID') });

router.get('/', authenticationToken, requireOwner, adminReadLimit, controller.list);
router.post('/', authenticationToken, requireOwner, adminMutateLimit, controller.create);
router.put('/:id', authenticationToken, requireOwner, adminMutateLimit, validate(idSchema, 'params'), controller.update);

export default router;


