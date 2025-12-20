import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import AdminUserController from '@/controllers/admin/adminUser.controller';
import { z } from 'zod';

const router = Router();
const controller = new AdminUserController();

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

router.get('/', authenticationToken, requireTeacherOrOwner, adminReadLimit, controller.list);
router.get('/teachers', authenticationToken, requireTeacherOrOwner, adminReadLimit, controller.listTeachers);
router.get('/:id', authenticationToken, requireTeacherOrOwner, adminReadLimit, validate(idSchema, 'params'), controller.getById);
router.post('/', authenticationToken, requireTeacherOrOwner, adminMutateLimit, controller.create);
router.put('/:id', authenticationToken, requireTeacherOrOwner, adminMutateLimit, validate(idSchema, 'params'), controller.update);
router.delete('/:id', authenticationToken, requireTeacherOrOwner, adminMutateLimit, validate(idSchema, 'params'), controller.remove);

export default router;


