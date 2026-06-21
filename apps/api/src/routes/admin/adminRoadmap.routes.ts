import { Router } from 'express';
import { validate } from '@backend/api/middlewares/validate.middleware';
import {
  authenticationToken,
  requireTeacherOrOwner,
} from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import AdminRoadmapController from '@backend/api/controllers/admin/adminRoadmap.controller';
import { createAdminRoadmapService } from '@backend/api/services/admin/adminRoadmap.service';
import {
  CreateRoadmapSchema,
  ListRoadmapsQuerySchema,
  AddRoadmapItemSchema,
  UpdateVisibilitySchema,
  ReorderRoadmapItemsSchema,
  RoadmapIdParamSchema,
  RemoveRoadmapItemParamSchema,
} from '@backend/shared/validations/roadmap.validation';

export function createAdminRoadmapRouter(): Router {
  const router = Router();
  const controller = new AdminRoadmapController(createAdminRoadmapService());

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

  router.get(
    '/',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(ListRoadmapsQuerySchema, 'query'),
    controller.list.bind(controller)
  );

  router.post(
    '/',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(CreateRoadmapSchema),
    controller.create.bind(controller)
  );

  // Get available lessons and problems for adding to roadmap (admin only)
  router.get(
    '/available-items/list',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    controller.getAvailableItems.bind(controller)
  );

  router.get(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(RoadmapIdParamSchema, 'params'),
    controller.getById.bind(controller)
  );

  router.post(
    '/:id/items',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(RoadmapIdParamSchema, 'params'),
    validate(AddRoadmapItemSchema),
    controller.addItem.bind(controller)
  );

  router.delete(
    '/:id/items/:itemId',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(RemoveRoadmapItemParamSchema, 'params'),
    controller.removeItem.bind(controller)
  );

  router.patch(
    '/:id/items/reorder',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(RoadmapIdParamSchema, 'params'),
    validate(ReorderRoadmapItemsSchema, 'body'),
    controller.reorderItems.bind(controller)
  );

  router.patch(
    '/:id/visibility',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(RoadmapIdParamSchema, 'params'),
    validate(UpdateVisibilitySchema, 'body'),
    controller.updateVisibility.bind(controller)
  );

  router.delete(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(RoadmapIdParamSchema, 'params'),
    controller.remove.bind(controller)
  );

  return router;
}

