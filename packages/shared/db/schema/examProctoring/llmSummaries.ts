import { index, jsonb, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examParticipations } from '../examParticipations';
import { users } from '../user';
import { proctoringAiJobs } from './aiJobs';
import { examProctoringSummaries } from './summaries';

export const examProctoringLlmSummaries = pgTable(
  'exam_proctoring_llm_summaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    deterministicSummaryId: uuid('deterministic_summary_id').references(
      () => examProctoringSummaries.id
    ),
    jobId: uuid('job_id').references(() => proctoringAiJobs.id),
    provider: varchar('provider', { length: 50 }).notNull(),
    modelVersion: varchar('model_version', { length: 100 }).notNull(),
    judgeModelVersion: varchar('judge_model_version', { length: 100 }),
    promptVersion: varchar('prompt_version', { length: 80 }).notNull(),
    inputSchemaVersion: varchar('input_schema_version', { length: 80 }).notNull(),
    outputSchemaVersion: varchar('output_schema_version', { length: 80 }).notNull(),
    inputHash: varchar('input_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 40 }).default('pending').notNull(),
    validationStatus: varchar('validation_status', { length: 40 }).default('not_run').notNull(),
    validationScore: numeric('validation_score', { precision: 5, scale: 4 }),
    validationErrorsJson: jsonb('validation_errors_json').$type<string[]>().default([]).notNull(),
    summaryJson: jsonb('summary_json').$type<Record<string, unknown> | null>(),
    riskFactsJson: jsonb('risk_facts_json').$type<Record<string, unknown>[] | null>(),
    missingDataNotesJson: jsonb('missing_data_notes_json').$type<string[] | null>(),
    modelNotesJson: jsonb('model_notes_json').$type<string[] | null>(),
    sourceEventIdsJson: jsonb('source_event_ids_json').$type<string[]>().default([]).notNull(),
    regenerationOfId: uuid('regeneration_of_id'),
    requestedBy: uuid('requested_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => [
    index('idx_exam_proctoring_llm_summaries_participation').on(
      table.examId,
      table.participationId,
      table.createdAt
    ),
    index('idx_exam_proctoring_llm_summaries_status').on(table.status, table.createdAt),
    index('idx_exam_proctoring_llm_summaries_model_prompt').on(
      table.modelVersion,
      table.promptVersion
    ),
    index('idx_exam_proctoring_llm_summaries_input').on(
      table.participationId,
      table.inputHash,
      table.promptVersion,
      table.modelVersion
    ),
  ]
);

export type ExamProctoringLlmSummaryEntity = typeof examProctoringLlmSummaries.$inferSelect;
export type ExamProctoringLlmSummaryInsert = typeof examProctoringLlmSummaries.$inferInsert;
