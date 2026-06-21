import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const examProctoringEvents = pgTable(
  'exam_proctoring_events',
  {
    id: uuid('id').defaultRandom().notNull(),
    examId: uuid('exam_id').notNull(),
    participationId: uuid('participation_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    entrySessionId: uuid('entry_session_id'),
    candidateUserId: uuid('candidate_user_id').notNull(),
    clientSessionId: varchar('client_session_id', { length: 100 }).notNull(),
    clientSeq: integer('client_seq').notNull(),
    type: varchar('type', { length: 80 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(),
    schemaVersion: integer('schema_version').notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp('captured_at').notNull(),
    receivedAt: timestamp('received_at').notNull(),
    persistedAt: timestamp('persisted_at').defaultNow().notNull(),
    buffered: boolean('buffered').default(false).notNull(),
    finalFlushReceiptId: uuid('final_flush_receipt_id'),
  },
  table => [
    primaryKey({
      name: 'pk_exam_proctoring_events',
      columns: [table.participationId, table.id],
    }),
    uniqueIndex('uq_exam_proctoring_events_dedupe').on(
      table.participationId,
      table.clientSessionId,
      table.clientSeq
    ),
    index('idx_exam_proctoring_events_participation_captured_at').on(
      table.participationId,
      table.capturedAt
    ),
    index('idx_exam_proctoring_events_exam_type_captured_at').on(
      table.examId,
      table.type,
      table.capturedAt
    ),
  ]
);

export type ExamProctoringEventEntity = typeof examProctoringEvents.$inferSelect;
export type ExamProctoringEventInsert = typeof examProctoringEvents.$inferInsert;
