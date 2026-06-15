import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examParticipations } from '../examParticipations';
import { examProctoringSessions } from './sessions';

export const proctoringAiJobs = pgTable(
  'proctoring_ai_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobKey: varchar('job_key', { length: 200 }).notNull(),
    jobType: varchar('job_type', { length: 50 }).default('anomaly_prediction').notNull(),
    parentJobId: uuid('parent_job_id'),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    sessionId: uuid('session_id').references(() => examProctoringSessions.id),
    windowStart: timestamp('window_start').notNull(),
    windowEnd: timestamp('window_end').notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    priority: integer('priority').default(0).notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    payloadSchemaVersion: varchar('payload_schema_version', { length: 50 }).notNull(),
    modelVersion: varchar('model_version', { length: 100 }),
    featureSchemaVersion: varchar('feature_schema_version', { length: 50 }),
    scoringSchemaVersion: varchar('scoring_schema_version', { length: 50 }),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    nextRunAt: timestamp('next_run_at').defaultNow().notNull(),
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedAt: timestamp('locked_at'),
    lastError: varchar('last_error', { length: 1000 }),
    resultJson: jsonb('result_json').$type<Record<string, unknown> | null>(),
    resultModelVersion: varchar('result_model_version', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => [
    uniqueIndex('uq_proctoring_ai_jobs_job_key').on(table.jobKey),
    index('idx_proctoring_ai_jobs_claim').on(table.status, table.nextRunAt, table.priority),
    index('idx_proctoring_ai_jobs_participation').on(table.participationId),
    index('idx_proctoring_ai_jobs_type_status').on(table.jobType, table.status),
  ]
);

export type ProctoringAiJobEntity = typeof proctoringAiJobs.$inferSelect;
export type ProctoringAiJobInsert = typeof proctoringAiJobs.$inferInsert;
