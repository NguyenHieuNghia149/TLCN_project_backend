import { Router } from 'express';
import { NotificationController } from '@backend/api/controllers/notification.controller';
import { authenticationToken as authenticate } from '@backend/api/middlewares/auth.middleware';
import { strictLimiter } from '@backend/api/middlewares/ratelimit.middleware';
import { createNotificationService } from '@backend/api/services/notification.service';

/** Creates the notification router without instantiating services at import time. */
export function createNotificationRouter(): Router {
  const router = Router();
  const notificationService = createNotificationService();
  const notificationController = new NotificationController(notificationService);
  const notificationRateLimit = strictLimiter;

  router.use(authenticate);

  router.get(
    '/',
    notificationRateLimit,
    notificationController.getMyNotifications.bind(notificationController)
  );
  router.patch(
    '/:id/read',
    notificationRateLimit,
    notificationController.markAsRead.bind(notificationController)
  );
  router.patch(
    '/read-all',
    notificationRateLimit,
    notificationController.markAllAsRead.bind(notificationController)
  );

  return router;
}

