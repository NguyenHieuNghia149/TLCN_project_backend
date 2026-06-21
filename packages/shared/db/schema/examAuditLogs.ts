import { json, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from './exam';
import { users } from './user';

export const examAuditLogs = pgTable('exam_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  examId: uuid('exam_id')
    .references(() => exam.id)
    .notNull(),
  actorType: varchar('actor_type', { length: 20 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: uuid('target_id'),
  metadata: json('metadata').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type ExamAuditLogEntity = typeof examAuditLogs.$inferSelect;
export type ExamAuditLogInsert = typeof examAuditLogs.$inferInsert;
