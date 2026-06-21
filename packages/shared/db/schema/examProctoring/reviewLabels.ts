import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { exam } from '../exam';
import { examParticipations } from '../examParticipations';
import { users } from '../user';
import { examProctoringSummaries } from './summaries';

export const examProctoringReviewLabels = pgTable(
  'exam_proctoring_review_labels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exam.id),
    participationId: uuid('participation_id')
      .notNull()
      .references(() => examParticipations.id),
    summaryId: uuid('summary_id').references(() => examProctoringSummaries.id),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    reviewOutcome: varchar('review_outcome', { length: 50 }).notNull(),
    evidenceConfidence: varchar('evidence_confidence', { length: 20 }).notNull(),
    notes: varchar('notes', { length: 2000 }),
    labelSchemaVersion: varchar('label_schema_version', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('idx_exam_proctoring_review_labels_exam_outcome').on(table.examId, table.reviewOutcome),
    index('idx_exam_proctoring_review_labels_participation_created').on(
      table.participationId,
      table.createdAt
    ),
    uniqueIndex('uq_exam_proctoring_review_labels_reviewer_schema').on(
      table.participationId,
      table.reviewerId,
      table.labelSchemaVersion
    ),
  ]
);

export type ExamProctoringReviewLabelEntity = typeof examProctoringReviewLabels.$inferSelect;
export type ExamProctoringReviewLabelInsert = typeof examProctoringReviewLabels.$inferInsert;
