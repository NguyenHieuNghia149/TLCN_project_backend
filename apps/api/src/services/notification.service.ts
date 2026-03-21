import { NotificationRepository } from '../repositories/notification.repository';
import { UserRepository } from '../repositories/user.repository';
import { ENotificationType } from '@backend/shared/types';
import {
  CreateNotificationInput,
  NotificationMetadataSchemas,
} from '@backend/shared/validations/notification.validation';
import { ValidationException } from '../exceptions/auth.exceptions';
import { NotificationNotFoundException } from '../exceptions/notification.exception';
import { getWebSocketService, IWebSocketNotifier } from './websocket.service';

type NotificationServiceDependencies = {
  notificationRepository: NotificationRepository;
  userRepository: UserRepository;
  getSocketService?: () => IWebSocketNotifier | null;
};

export class NotificationService {
  private notificationRepository: NotificationRepository;
  private userRepository: UserRepository;
  private readonly getSocketService: () => IWebSocketNotifier | null;

  constructor({
    notificationRepository,
    userRepository,
    getSocketService = getWebSocketService,
  }: NotificationServiceDependencies) {
    this.notificationRepository = notificationRepository;
    this.userRepository = userRepository;
    this.getSocketService = getSocketService;
  }

  /**
   * Validate metadata based on notification type
   */
  private validateMetadata(type: ENotificationType, metadata: any) {
    const schema = NotificationMetadataSchemas[type];
    if (schema) {
      const result = schema.safeParse(metadata);
      if (!result.success) {
        throw new ValidationException(
          `Invalid metadata for notification type ${type}: ${result.error.message}`
        );
      }
    }
  }

  /**
   * Create a notification for a single user and emit socket event
   */
  async notifyUser(
    userId: string,
    type: string | ENotificationType,
    title: string,
    message: string,
    metadata?: any
  ) {
    const typeEnum = type as ENotificationType;
    this.validateMetadata(typeEnum, metadata);

    const newNotification: CreateNotificationInput = {
      userId,
      type: typeEnum,
      title,
      message,
      metadata,
    };

    const created = await this.notificationRepository.create(newNotification as any);

    const socketService = this.getSocketService();
    if (socketService) {
      socketService.emitToUser(userId, 'notification_new', created);
    }

    return created;
  }

  /**
   * Broadcast notification to ALL users
   */
  async notifyAllUsers(
    type: string | ENotificationType,
    title: string,
    message: string,
    metadata?: any
  ) {
    const typeEnum = type as ENotificationType;
    this.validateMetadata(typeEnum, metadata);

    const userIds = await this.userRepository.findAllIds();

    if (userIds.length === 0) {
      return;
    }

    const notificationsToInsert: CreateNotificationInput[] = userIds.map((userId: any) => ({
      userId,
      type: typeEnum,
      title,
      message,
      metadata,
    }));

    if (notificationsToInsert.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < notificationsToInsert.length; i += chunkSize) {
        const chunk = notificationsToInsert.slice(i, i + chunkSize);
        await this.notificationRepository.createMany(chunk as any);
      }
    }

    const socketService = this.getSocketService();
    if (socketService) {
      socketService.getIO().emit('notification_new', {
        id: 'global-temp-id',
        userId: 'global',
        type,
        title,
        message,
        metadata,
        createdAt: new Date(),
        isRead: false,
        isGlobal: true,
      });
    }
  }

  async getMyNotifications(userId: string, limit: number, offset: number) {
    return this.notificationRepository.findByUserId(userId, limit, offset);
  }

  async countUnread(userId: string) {
    return this.notificationRepository.countUnread(userId);
  }

  async markAsRead(id: string, userId: string) {
    const updated = await this.notificationRepository.markAsRead(id, userId);
    if (!updated) {
      throw new NotificationNotFoundException();
    }
    return updated;
  }

  async markAllAsRead(userId: string) {
    return this.notificationRepository.markAllAsRead(userId);
  }
}

/** Creates a NotificationService instance with an optional websocket provider override. */
export function createNotificationService(
  getSocketService: () => IWebSocketNotifier | null = getWebSocketService
): NotificationService {
  return new NotificationService({
    notificationRepository: new NotificationRepository(),
    userRepository: new UserRepository(),
    getSocketService,
  });
}
