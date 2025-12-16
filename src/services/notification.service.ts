import { NotificationRepository } from '@/repositories/notification.repository';
import { UserRepository } from '@/repositories/user.repository';
import { websocketService } from './websocket.service';
import { ENotificationType } from '@/enums/notificationType.enum';
import {
  CreateNotificationInput,
  CreateNotificationSchema,
  NotificationMetadataSchemas,
} from '@/validations/notification.validation';
import { ValidationException } from '@/exceptions/auth.exceptions';
import { NotificationNotFoundException } from '@/exceptions/notification.exception';

export class NotificationService {
  private notificationRepository: NotificationRepository;
  private userRepository: UserRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
    this.userRepository = new UserRepository();
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
    // Validate Input
    const typeEnum = type as ENotificationType;
    this.validateMetadata(typeEnum, metadata);

    // 1. Save to DB
    const newNotification: CreateNotificationInput = {
      userId,
      type: typeEnum,
      title,
      message,
      metadata,
    };

    // Validate entire object (optional, since we constructed it)
    // CreateNotificationSchema.parse(newNotification);

    const created = await this.notificationRepository.create(newNotification as any);

    // 2. Emit Socket
    if (websocketService) {
      websocketService.emitToUser(userId, 'notification_new', created);
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
    // Validate Metadata
    const typeEnum = type as ENotificationType;
    this.validateMetadata(typeEnum, metadata);

    // 1. Get all users
    const userIds = await this.userRepository.findAllIds();

    if (userIds.length === 0) {
      return;
    }

    // 2. Prepare DB inserts
    const notificationsToInsert: CreateNotificationInput[] = userIds.map(userId => ({
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

    // 3. Emit Socket events
    if (websocketService) {
      // Emit generic event for frontend to handle "refresh" or display
      websocketService.getIO().emit('notification_new', {
        id: 'global-temp-id', // Frontend might need an ID
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

export const notificationService = new NotificationService();
