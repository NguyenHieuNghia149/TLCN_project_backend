import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examEntrySessions } from '../examEntrySessions';
import { examParticipations } from '../examParticipations';
import { users } from '../user';

export const examProctoringBypassCodes = pgTable(
  'exam_proctoring_bypass_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    entrySessionId: uuid('entry_session_id').references(() => examEntrySessions.id),
    participationId: uuid('participation_id').references(() => examParticipations.id),
    clientSessionId: varchar('client_session_id', { length: 100 }).notNull(),
    codeHash: varchar('code_hash', { length: 255 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id),
    usedByUserId: uuid('used_by_user_id').references(() => users.id),
    usedAt: timestamp('used_at'),
    expiresAt: timestamp('expires_at').notNull(),
    failedAttempts: integer('failed_attempts').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_proctoring_bypass_lookup').on(
      table.examId,
      table.entrySessionId,
      table.participationId,
      table.clientSessionId
    ),
    index('idx_exam_proctoring_bypass_status_expires').on(table.status, table.expiresAt),
  ]
);

export type ExamProctoringBypassCodeEntity = typeof examProctoringBypassCodes.$inferSelect;
export type ExamProctoringBypassCodeInsert = typeof examProctoringBypassCodes.$inferInsert;
