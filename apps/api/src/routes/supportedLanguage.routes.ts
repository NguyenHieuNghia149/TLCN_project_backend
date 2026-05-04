import { Router } from 'express';
import { z } from 'zod';

import { authenticationToken, requireTeacherOrOwner } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';
import { SupportedLanguageController } from '@backend/api/controllers/supportedLanguage.controller';
import { createSupportedLanguageService } from '@backend/api/services/supportedLanguage.service';
import { UpdateSupportedLanguageSchema } from '@backend/shared/validations/supportedLanguage.validation';

export function createSupportedLanguageRouter(): Router {
  const router = Router();
  const service = createSupportedLanguageService();
  const controller = new SupportedLanguageController(service);

  const readLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many language catalog requests, please try again later.',
  });

  const mutateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many language catalog update requests, please try again later.',
  });

  const idSchema = z.object({
    id: z.string().min(1, 'Language ID is required.'),
  });

  router.get('/languages', readLimit, controller.listActiveLanguages.bind(controller));
  router.get(
    '/admin/languages',
    authenticationToken,
    requireTeacherOrOwner,
    readLimit,
    controller.listAllLanguages.bind(controller),
  );
  router.put(
    '/admin/languages/:id',
    authenticationToken,
    requireTeacherOrOwner,
    mutateLimit,
    validate(idSchema, 'params'),
    validate(UpdateSupportedLanguageSchema),
    controller.updateLanguage.bind(controller),
  );

  return router;
}

