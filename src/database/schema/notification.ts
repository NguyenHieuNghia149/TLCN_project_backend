import { pgTable, text, timestamp, uuid, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './user';
import { ENotificationType } from '@/enums/notificationType.enum';

export const notificationTypeEnum = pgEnum('notification_type', [
  ENotificationType.NEW_EXAM,
  ENotificationType.SYSTEM,
  ENotificationType.SUBMISSION,
  ENotificationType.COMMENT,
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata'), // Stores generic data like { examId: '...', link: '...' }
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type NotificationEntity = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
