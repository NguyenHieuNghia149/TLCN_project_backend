import { index, jsonb, pgTable, real, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examParticipations } from '../examParticipations';
import { proctoringAiJobs } from './aiJobs';
import { examProctoringSessions } from './sessions';

export type AiFeatureContributionJson = {
  featureName: string;
  numericValue: number;
  contribution: number;
  direction: 'increased_risk' | 'decreased_risk';
  displayLabel: string;
};

export const examProctoringAnomalyResults = pgTable(
  'exam_proctoring_anomaly_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    sessionId: uuid('session_id').references(() => examProctoringSessions.id),
    jobId: uuid('job_id')
      .notNull()
      .references(() => proctoringAiJobs.id),
    windowId: varchar('window_id', { length: 120 }).notNull(),
    windowStart: timestamp('window_start').notNull(),
    windowEnd: timestamp('window_end').notNull(),
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    featureSchemaVersion: varchar('feature_schema_version', { length: 50 }).notNull(),
    scoringSchemaVersion: varchar('scoring_schema_version', { length: 50 }).notNull(),
    anomalyScore: real('anomaly_score').notNull(),
    rawScore: real('raw_score'),
    riskLevel: varchar('risk_level', { length: 20 }).notNull(),
    explanationStatus: varchar('explanation_status', { length: 30 })
      .default('not_requested')
      .notNull(),
    topContributorsJson: jsonb('top_contributors_json')
      .$type<AiFeatureContributionJson[]>()
      .default([])
      .notNull(),
    explanationSkippedReason: varchar('explanation_skipped_reason', { length: 500 }),
    sourceEventRangeJson: jsonb('source_event_range_json')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    explainedAt: timestamp('explained_at'),
  },
  table => [
    uniqueIndex('uq_exam_proctoring_anomaly_results_window_model').on(
      table.participationId,
      table.windowId,
      table.modelVersion
    ),
    index('idx_exam_proctoring_anomaly_results_participation_window').on(
      table.examId,
      table.participationId,
      table.windowStart
    ),
    index('idx_exam_proctoring_anomaly_results_exam_risk').on(
      table.examId,
      table.riskLevel,
      table.windowStart
    ),
    index('idx_exam_proctoring_anomaly_results_explanation').on(
      table.explanationStatus,
      table.riskLevel
    ),
  ]
);

export type ExamProctoringAnomalyResultEntity = typeof examProctoringAnomalyResults.$inferSelect;
export type ExamProctoringAnomalyResultInsert = typeof examProctoringAnomalyResults.$inferInsert;
