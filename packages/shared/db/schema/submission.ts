import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { examParticipations } from './examParticipations';
import { languages } from './languages';
import { problems } from './problem';
import { users } from './user';
import {
  ESubmissionStatus,
  SUBMISSION_STATUS_VALUES,
} from '@backend/shared/types/submissionStatus.enum';

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceCode: text('source_code').notNull(),
    status: varchar('status', { length: 50 })
      .notNull()
      .default(ESubmissionStatus.PENDING.toString()),
    languageId: uuid('language_id')
      .references(() => languages.id)
      .notNull(),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    judgedAt: timestamp('judged_at'),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    problemId: uuid('problem_id')
      .references(() => problems.id)
      .notNull(),
    examParticipationId: uuid('exam_participation_id').references(() => examParticipations.id),
  },
  table => [
    index('idx_submissions_user_submitted_at').on(table.userId, table.submittedAt),
    index('idx_submissions_problem_submitted_at').on(table.problemId, table.submittedAt),
    index('idx_submissions_status_submitted_at').on(table.status, table.submittedAt),
    index('idx_submissions_user_problem_submitted_at').on(
      table.userId,
      table.problemId,
      table.submittedAt
    ),
    index('idx_submissions_language_id').on(table.languageId),
    index('idx_submissions_language_id_submitted_at').on(table.languageId, table.submittedAt),
    index('idx_submissions_accepted_solved_lookup')
      .on(table.userId, table.problemId)
      .where(sql`${table.status} = 'accepted' AND ${table.examParticipationId} IS NULL`),
  ]
);

export type SubmissionEntity = typeof submissions.$inferSelect;
export type SubmissionInsert = typeof submissions.$inferInsert;

export const insertSubmissionSchema = createInsertSchema(submissions, {
  sourceCode: z.string().min(1),
  status: z
    .enum(SUBMISSION_STATUS_VALUES)
    .default(ESubmissionStatus.PENDING),
  languageId: z.string().uuid(),
  submittedAt: z.string().optional(),
  judgedAt: z.string().optional(),
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
  examParticipationId: z.string().uuid().optional(),
});

export const selectSubmissionSchema = createSelectSchema(submissions);
