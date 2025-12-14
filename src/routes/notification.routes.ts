import { Router } from 'express';
import { NotificationController } from '@/controllers/notification.controller';
import { authenticationToken as authenticate } from '@/middlewares/auth.middleware';
import { strictLimiter } from '@/middlewares/ratelimit.middleware';
import { NotificationService } from '@/services/notification.service';

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

router.use(NotificationController.errorHandler);
export default router;
