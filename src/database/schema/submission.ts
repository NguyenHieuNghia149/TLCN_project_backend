import { pgTable, uuid, text, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { problem } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const submission = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceCode: text('source_code').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('PENDING'),
  language: varchar('language', { length: 50 }).notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  problemId: uuid('problem_id')
    .references(() => problem.id)
    .notNull(),
});

export type SubmissionEntity = typeof submission.$inferSelect;
export type SubmissionInsert = typeof submission.$inferInsert;

export const insertSubmissionSchema = createInsertSchema(submission, {
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
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
});

export const selectSubmissionSchema = createSelectSchema(submission);
