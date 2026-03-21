import { Router } from 'express';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { authenticationToken, requireOwner } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import AdminTeacherController from '@backend/api/controllers/admin/adminTeacher.controller';
import { AdminUserService } from '@backend/api/services/admin/adminUser.service';
import { z } from 'zod';

/** Creates the admin-teacher router without constructing controllers at import time. */
export function createAdminTeacherRouter(): Router {
  const router = Router();
  const adminUserService = new AdminUserService();
  const controller = new AdminTeacherController(adminUserService);

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

  const idSchema = z.object({ id: z.string().uuid('Invalid user ID') });

  router.get('/', authenticationToken, requireOwner, adminReadLimit, controller.list);
  router.post('/', authenticationToken, requireOwner, adminMutateLimit, controller.create);
  router.put(
    '/:id',
    authenticationToken,
    requireOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    controller.update
  );

  return router;
}
