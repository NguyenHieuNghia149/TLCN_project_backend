import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examParticipations } from '../examParticipations';
import { examProctoringSessions } from './sessions';

export const examProctoringFinalFlushReceipts = pgTable(
  'exam_proctoring_final_flush_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => examProctoringSessions.id),
    clientSessionId: varchar('client_session_id', { length: 100 }).notNull(),
    submitAttemptId: varchar('submit_attempt_id', { length: 100 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    expectedEventCount: integer('expected_event_count').default(0).notNull(),
    acceptedCount: integer('accepted_count').default(0).notNull(),
    dedupedCount: integer('deduped_count').default(0).notNull(),
    persistedCount: integer('persisted_count').default(0).notNull(),
    firstClientSeq: integer('first_client_seq'),
    lastClientSeq: integer('last_client_seq'),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessage: varchar('error_message', { length: 500 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    persistedAt: timestamp('persisted_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('uq_exam_proctoring_final_flush_participation_submit').on(
      table.participationId,
      table.submitAttemptId
    ),
    index('idx_exam_proctoring_final_flush_participation_status').on(
      table.participationId,
      table.status
    ),
  ]
);

export type ExamProctoringFinalFlushReceiptEntity =
  typeof examProctoringFinalFlushReceipts.$inferSelect;
export type ExamProctoringFinalFlushReceiptInsert =
  typeof examProctoringFinalFlushReceipts.$inferInsert;
