import { BaseRepository } from './base.repository';
import {
  notifications,
  NotificationEntity,
  NotificationInsert,
} from '@/database/schema/notification';
import { eq, desc, and } from 'drizzle-orm';

export class NotificationRepository extends BaseRepository<
  typeof notifications,
  NotificationEntity,
  NotificationInsert
> {
  constructor() {
    super(notifications);
  }

  async createMany(data: NotificationInsert[]) {
    return this.db.insert(notifications).values(data).returning();
  }

  async findByUserId(userId: string, limit: number = 20, offset: number = 0) {
    return this.db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset,
    });
  }

  async countUnread(userId: string) {
    const result = await this.db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
    });
    return result.length;
  }

  async markAsRead(id: string, userId: string) {
    const [updated] = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return updated;
  }

  async markAllAsRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }
}
