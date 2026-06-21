import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examEntrySessions } from '../examEntrySessions';
import { examParticipations } from '../examParticipations';
import { users } from '../user';
import { examProctoringConsents } from './consents';

export const examProctoringPrechecks = pgTable(
  'exam_proctoring_prechecks',
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
    consentRecordId: uuid('consent_record_id')
      .notNull()
      .references(() => examProctoringConsents.id),
    browserName: varchar('browser_name', { length: 80 }),
    browserVersion: varchar('browser_version', { length: 80 }),
    osName: varchar('os_name', { length: 80 }),
    getUserMediaSupported: boolean('get_user_media_supported').notNull(),
    cameraPermissionGranted: boolean('camera_permission_granted').notNull(),
    getDisplayMediaSupported: boolean('get_display_media_supported').notNull(),
    displaySurface: varchar('display_surface', { length: 30 }),
    monitorValidated: boolean('monitor_validated').notNull(),
    fullscreenSupported: boolean('fullscreen_supported').notNull(),
    browserSupported: boolean('browser_supported').notNull(),
    passed: boolean('passed').notNull(),
    failureReasonsJson: jsonb('failure_reasons_json')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  table => [
    index('idx_exam_proctoring_prechecks_candidate_exam').on(
      table.candidateUserId,
      table.examId,
      table.expiresAt
    ),
    index('idx_exam_proctoring_prechecks_participation').on(table.participationId),
  ]
);

export type ExamProctoringPrecheckEntity = typeof examProctoringPrechecks.$inferSelect;
export type ExamProctoringPrecheckInsert = typeof examProctoringPrechecks.$inferInsert;
