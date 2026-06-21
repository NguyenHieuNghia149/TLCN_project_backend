import { sql } from 'drizzle-orm';
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
import { users } from '../user';
import { examProctoringSessions } from './sessions';

export const examProctoringSummaries = pgTable(
  'exam_proctoring_summaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    sessionId: uuid('session_id').references(() => examProctoringSessions.id),
    riskScore: integer('risk_score').default(0).notNull(),
    riskLevel: varchar('risk_level', { length: 20 }).default('low').notNull(),
    eventCountsJson: jsonb('event_counts_json')
      .$type<Record<string, number>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    velocityJson: jsonb('velocity_json')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    finalFlushStatus: varchar('final_flush_status', { length: 30 }),
    lastEventCapturedAt: timestamp('last_event_captured_at'),
    lastEventReceivedAt: timestamp('last_event_received_at'),
    deterministicSchemaVersion: varchar('deterministic_schema_version', { length: 50 }).notNull(),
    computedAt: timestamp('computed_at').notNull(),
    reviewerDecision: varchar('reviewer_decision', { length: 30 }).default('pending').notNull(),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    reviewerNotes: varchar('reviewer_notes', { length: 2000 }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('uq_exam_proctoring_summaries_participation').on(table.participationId),
    index('idx_exam_proctoring_summaries_exam_risk').on(table.examId, table.riskLevel),
  ]
);

export type ExamProctoringSummaryEntity = typeof examProctoringSummaries.$inferSelect;
export type ExamProctoringSummaryInsert = typeof examProctoringSummaries.$inferInsert;
