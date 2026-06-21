import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { exam } from './exam';
import { users } from './user';

export const examParticipants = pgTable(
  'exam_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .references(() => exam.id)
      .notNull(),
    userId: uuid('user_id').references(() => users.id),
    normalizedEmail: varchar('normalized_email', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    source: varchar('source', { length: 30 }).notNull(),
    approvalStatus: varchar('approval_status', { length: 20 }).default('pending').notNull(),
    accessStatus: varchar('access_status', { length: 20 }),
    approvedBy: uuid('approved_by').references(() => users.id),
    inviteSentAt: timestamp('invite_sent_at'),
    joinedAt: timestamp('joined_at'),
    mergedIntoParticipantId: uuid('merged_into_participant_id'),
    mergedAt: timestamp('merged_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('uq_exam_participants_exam_email').on(table.examId, table.normalizedEmail),
    uniqueIndex('uq_exam_participants_exam_user')
      .on(table.examId, table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    index('idx_exam_participants_exam_access').on(table.examId, table.accessStatus),
    index('idx_exam_participants_exam_approval').on(table.examId, table.approvalStatus),
  ],
);

export type ExamParticipantEntity = typeof examParticipants.$inferSelect;
export type ExamParticipantInsert = typeof examParticipants.$inferInsert;
