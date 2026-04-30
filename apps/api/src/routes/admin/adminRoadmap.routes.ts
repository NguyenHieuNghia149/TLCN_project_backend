import { Router } from 'express';
import { z } from 'zod';
import { validate } from '@backend/api/middlewares/validate.middleware';
import {
  authenticationToken,
  requireTeacherOrOwner,
} from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import AdminRoadmapController from '@backend/api/controllers/admin/adminRoadmap.controller';
import { createAdminRoadmapService } from '@backend/api/services/admin/adminRoadmap.service';

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

  const idSchema = z.object({ id: z.string().uuid('Invalid roadmap ID') });

  const listQuerySchema = z.object({
    keyword: z.string().optional(),
    createdBy: z.string().uuid().optional(),
    visibility: z.enum(['public', 'private']).optional(),
    createdAtFrom: z.string().optional(),
    createdAtTo: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    offset: z.coerce.number().min(0).optional(),
  });

  const createRoadmapSchema = z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional(),
    visibility: z.enum(['public', 'private']).optional().default('public'),
  });

  const addItemSchema = z.object({
    itemType: z.enum(['lesson', 'problem']),
    itemId: z.string().uuid('Invalid item ID'),
    order: z.number().int().optional(),
  });

  const visibilityBodySchema = z.object({
    visibility: z.enum(['public', 'private']),
  });

  const reorderSchema = z.object({
    itemIds: z.array(z.string().uuid('Invalid item ID')),
  });

  router.get(
    '/',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(listQuerySchema, 'query'),
    controller.list
  );

  router.post(
    '/',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(createRoadmapSchema),
    controller.create
  );

  // Get available lessons and problems for adding to roadmap (admin only)
  router.get(
    '/available-items/list',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    controller.getAvailableItems
  );

  router.get(
    '/:id',
    authenticationToken,
    requireTeacherOrOwner,
    adminReadLimit,
    validate(idSchema, 'params'),
    controller.getById
  );

  router.post(
    '/:id/items',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    validate(addItemSchema),
    controller.addItem
  );

  router.delete(
    '/:id/items/:itemId',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(z.object({ id: z.string().uuid(), itemId: z.string().uuid() }), 'params'),
    controller.removeItem
  );

  router.patch(
    '/:id/items/reorder',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    validate(reorderSchema, 'body'),
    controller.reorderItems
  );

  router.patch(
    '/:id/visibility',
    authenticationToken,
    requireTeacherOrOwner,
    adminMutateLimit,
    validate(idSchema, 'params'),
    validate(visibilityBodySchema, 'body'),
    controller.updateVisibility
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

