import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examEntrySessions } from '../examEntrySessions';
import { examParticipations } from '../examParticipations';
import { users } from '../user';

export const examProctoringConsents = pgTable(
  'exam_proctoring_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    entrySessionId: uuid('entry_session_id').references(() => examEntrySessions.id),
    participationId: uuid('participation_id').references(() => examParticipations.id),
    candidateUserId: uuid('candidate_user_id')
      .notNull()
      .references(() => users.id),
    clientSessionId: varchar('client_session_id', { length: 100 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    noticeVersion: varchar('notice_version', { length: 50 }).notNull(),
    noticeSnapshotJson: jsonb('notice_snapshot_json').$type<Record<string, unknown>>().notNull(),
    acceptedCapabilitiesJson: jsonb('accepted_capabilities_json')
      .$type<Record<string, boolean>>()
      .notNull(),
    legalLinksSnapshotJson: jsonb('legal_links_snapshot_json')
      .$type<Record<string, string>>()
      .notNull(),
    dataRetentionDaysSnapshot: integer('data_retention_days_snapshot').notNull(),
    dataDeletionSlaDaysSnapshot: integer('data_deletion_sla_days_snapshot').notNull(),
    sensitiveDataDeletionTargetHoursSnapshot: integer(
      'sensitive_data_deletion_target_hours_snapshot'
    ).notNull(),
    acceptedAt: timestamp('accepted_at').notNull(),
    withdrawnAt: timestamp('withdrawn_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_proctoring_consents_candidate_exam').on(
      table.candidateUserId,
      table.examId,
      table.createdAt
    ),
    index('idx_exam_proctoring_consents_participation').on(table.participationId),
  ]
);

export type ExamProctoringConsentEntity = typeof examProctoringConsents.$inferSelect;
export type ExamProctoringConsentInsert = typeof examProctoringConsents.$inferInsert;
