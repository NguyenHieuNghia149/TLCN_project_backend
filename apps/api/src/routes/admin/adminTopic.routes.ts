import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { authenticationToken, requireTeacherOrOwner } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { AdminTopicController } from '@backend/api/controllers/admin/adminTopic.controller';
import { AdminTopicService } from '@backend/api/services/admin/adminTopic.service';
import { CreateTopicSchema, UpdateTopicSchema } from '@backend/shared/validations/topic.validation';

/** Creates the admin-topic router without constructing controllers at import time. */
export function createAdminTopicRouter(): Router {
  const router = Router();
  const adminTopicService = new AdminTopicService();
  const controller = new AdminTopicController(adminTopicService);

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

  const idSchema = z.object({ id: z.string().uuid('Invalid topic ID') });

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
    validate(CreateTopicSchema),
    controller.create
  );
  router.put(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    validate(UpdateTopicSchema.partial()),
    controller.update
  );
  router.delete(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    controller.delete
  );
  router.get(
    '/:id/stats',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(idSchema, 'params'),
    controller.getStats
  );

  return router;
}
