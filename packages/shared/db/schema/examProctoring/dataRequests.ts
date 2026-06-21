import { boolean, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examParticipations } from '../examParticipations';
import { users } from '../user';

export const examProctoringDataRequests = pgTable(
  'exam_proctoring_data_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id').references(() => examParticipations.id),
    requesterUserId: uuid('requester_user_id').references(() => users.id),
    candidateUserId: uuid('candidate_user_id')
      .notNull()
      .references(() => users.id),
    requestType: varchar('request_type', { length: 30 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    requestedAt: timestamp('requested_at').notNull(),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    reasonCode: varchar('reason_code', { length: 80 }),
    statutoryDueAt: timestamp('statutory_due_at').notNull(),
    internalTargetDueAt: timestamp('internal_target_due_at').notNull(),
    executionTargetHours: integer('execution_target_hours').default(72).notNull(),
    completedAt: timestamp('completed_at'),
    legalHoldUntil: timestamp('legal_hold_until'),
    requestMetadataJson: jsonb('request_metadata_json').$type<Record<string, unknown> | null>(),
    resultJson: jsonb('result_json').$type<Record<string, unknown> | null>(),
    evidenceReportJson: jsonb('evidence_report_json').$type<Record<string, unknown> | null>(),
    lastExecutionDryRun: boolean('last_execution_dry_run'),
    lastExecutionRequestedAt: timestamp('last_execution_requested_at'),
    lastExecutionRequestedBy: uuid('last_execution_requested_by').references(() => users.id),
    dryRunMode: varchar('dry_run_mode', { length: 20 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_proctoring_data_requests_candidate_status').on(
      table.candidateUserId,
      table.status,
      table.requestedAt
    ),
    index('idx_exam_proctoring_data_requests_participation').on(table.participationId),
    index('idx_exam_proctoring_data_requests_status_due').on(table.status, table.internalTargetDueAt),
    index('idx_exam_proctoring_data_requests_type_status').on(table.requestType, table.status),
  ]
);

export type ExamProctoringDataRequestEntity = typeof examProctoringDataRequests.$inferSelect;
export type ExamProctoringDataRequestInsert = typeof examProctoringDataRequests.$inferInsert;
