import { Router } from 'express';
import { NotificationController } from '@backend/api/controllers/notification.controller';
import { authenticationToken as authenticate } from '@backend/api/middlewares/auth.middleware';
import { strictLimiter } from '@backend/api/middlewares/ratelimit.middleware';
import { NotificationService } from '@backend/api/services/notification.service';

const router = Router();
const notificationService = new NotificationService();
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

export default router;
