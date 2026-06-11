import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

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
    candidateUserId: uuid('candidate_user_id')
      .notNull()
      .references(() => users.id),
    requestType: varchar('request_type', { length: 30 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    requestedAt: timestamp('requested_at').notNull(),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    statutoryDueAt: timestamp('statutory_due_at').notNull(),
    internalTargetDueAt: timestamp('internal_target_due_at').notNull(),
    completedAt: timestamp('completed_at'),
    resultJson: jsonb('result_json').$type<Record<string, unknown> | null>(),
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
  ]
);

export type ExamProctoringDataRequestEntity = typeof examProctoringDataRequests.$inferSelect;
export type ExamProctoringDataRequestInsert = typeof examProctoringDataRequests.$inferInsert;
