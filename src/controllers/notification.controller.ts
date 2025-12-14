import { NextFunction, Request, Response } from 'express';
import { NotificationService } from '@/services/notification.service';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { BaseException, ErrorHandler, UserNotFoundException } from '@/exceptions/auth.exceptions';
import { NotificationNotFoundException } from '@/exceptions/notification.exception';

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  async getMyNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
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

      return res.status(200).json({
        success: true,
        data: { notifications, unreadCount },
        message: 'Notifications retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) {
        throw new UserNotFoundException();
      }

      const { id } = req.params;
      if (!id) {
        throw new NotificationNotFoundException();
      }

      const updated = await this.notificationService.markAsRead(id, userId);

      return res.status(200).json({
        success: true,
        data: updated,
        message: 'Notification marked as read',
      });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.userId;
      if (!userId) {
        throw new UserNotFoundException();
      }

      await this.notificationService.markAllAsRead(userId);

      return res.status(200).json({
        success: true,
        data: null,
        message: 'All notifications marked as read',
      });
    } catch (error) {
      next(error);
    }
  }

  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    if (error instanceof BaseException || error instanceof UserNotFoundException) {
      const errorResponse = ErrorHandler.getErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: errorResponse.timestamp,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}
