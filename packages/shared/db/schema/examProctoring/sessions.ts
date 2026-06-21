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
import { examEntrySessions } from '../examEntrySessions';
import { examParticipations } from '../examParticipations';
import { users } from '../user';
import { examProctoringBypassCodes } from './bypassCodes';
import { examProctoringConsents } from './consents';
import { examProctoringPrechecks } from './prechecks';

export const examProctoringSessions = pgTable(
  'exam_proctoring_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    entrySessionId: uuid('entry_session_id').references(() => examEntrySessions.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    candidateUserId: uuid('candidate_user_id')
      .notNull()
      .references(() => users.id),
    clientSessionId: varchar('client_session_id', { length: 100 }).notNull(),
    consentRecordId: uuid('consent_record_id')
      .notNull()
      .references(() => examProctoringConsents.id),
    precheckId: uuid('precheck_id').references(() => examProctoringPrechecks.id),
    bypassCodeId: uuid('bypass_code_id').references(() => examProctoringBypassCodes.id),
    status: varchar('status', { length: 30 }).notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    lastSeenAt: timestamp('last_seen_at'),
    lastAcceptedClientSeq: integer('last_accepted_client_seq').default(0).notNull(),
    lastPersistedClientSeq: integer('last_persisted_client_seq').default(0).notNull(),
    activeDeadlineType: varchar('active_deadline_type', { length: 50 }),
    activeDeadlineAt: timestamp('active_deadline_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('uq_exam_proctoring_sessions_participation_client').on(
      table.participationId,
      table.clientSessionId
    ),
    index('idx_exam_proctoring_sessions_exam_status').on(table.examId, table.status),
  ]
);

export type ExamProctoringSessionEntity = typeof examProctoringSessions.$inferSelect;
export type ExamProctoringSessionInsert = typeof examProctoringSessions.$inferInsert;
