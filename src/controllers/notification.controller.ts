import { NextFunction, Request, Response } from 'express';
import { NotificationService } from '@/services/notification.service';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { UserNotFoundException } from '@/exceptions/auth.exceptions';
import { NotificationNotFoundException } from '@/exceptions/notification.exception';

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  async getMyNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UserNotFoundException();
    }

    const { limit, offset } = req.query;

    const notifications = await this.notificationService.getMyNotifications(
      userId,
      Number(limit) || 20,
      Number(offset) || 0
    );

    const unreadCount = await this.notificationService.countUnread(userId);

    res.status(200).json({
      notifications,
      unreadCount,
    });
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UserNotFoundException();
    }

    const { id } = req.params;
    if (!id) {
      throw new NotificationNotFoundException();
    }

    const updated = await this.notificationService.markAsRead(id as string, userId);

    res.status(200).json({
      ...updated,
      message: 'Notification marked as read',
    });
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UserNotFoundException();
    }

    await this.notificationService.markAllAsRead(userId);

    res.status(200).json({
      message: 'All notifications marked as read',
    });
  }
}
