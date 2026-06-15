import { json, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './user';

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorType: varchar('actor_type', { length: 20 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 80 }).notNull(),
  targetType: varchar('target_type', { length: 80 }).notNull(),
  targetId: uuid('target_id'),
  metadata: json('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type AdminAuditLogEntity = typeof adminAuditLogs.$inferSelect;
export type AdminAuditLogInsert = typeof adminAuditLogs.$inferInsert;
