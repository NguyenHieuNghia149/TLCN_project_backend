import { Router } from 'express';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import AdminUserController from '@backend/api/controllers/admin/adminUser.controller';
import { createAdminUserService } from '@backend/api/services/admin/adminUser.service';
import { z } from 'zod';

/** Creates the admin-user router without constructing controllers at import time. */
export function createAdminUserRouter(): Router {
  const router = Router();
  const adminUserService = createAdminUserService();
  const controller = new AdminUserController(adminUserService);

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

  router.get('/', authenticationToken, requireTeacherOrOwner, adminReadLimit, controller.list);
  router.get(
    '/teachers',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    controller.listTeachers
  );
  router.get(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(idSchema, 'params'),
    controller.getById
  );
  router.post('/', authenticationToken, requireTeacherOrOwner, adminMutateLimit, controller.create);
  router.put(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
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
