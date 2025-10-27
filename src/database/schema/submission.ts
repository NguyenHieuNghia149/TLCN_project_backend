import { pgTable, uuid, text, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { ESubmissionStatus } from '@/enums/ESubmissionStatus';

export const submissions = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceCode: text('source_code').notNull(),
  status: varchar('status', { length: 50 }).notNull().default(ESubmissionStatus.PENDING.toString()),
  language: varchar('language', { length: 50 }).notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  judgedAt: timestamp('judged_at'),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  problemId: uuid('problem_id')
    .references(() => problems.id)
    .notNull(),
});

export type SubmissionEntity = typeof submissions.$inferSelect;
export type SubmissionInsert = typeof submissions.$inferInsert;

export const insertSubmissionSchema = createInsertSchema(submissions, {
  sourceCode: z.string().min(1),
  status: z
    .enum([
      'PENDING',
      'RUNNING',
      'ACCEPTED',
      'WRONG_ANSWER',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'RUNTIME_ERROR',
      'COMPILATION_ERROR',
    ])
    .default('PENDING'),
  language: z.string().min(1),
  submittedAt: z.string().optional(),
  judgedAt: z.string().optional(),
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
});

export const selectSubmissionSchema = createSelectSchema(submissions);
