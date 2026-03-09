import { pgTable, uuid, text, boolean, real, timestamp } from 'drizzle-orm/pg-core';
import { submissions } from './submission';
import { testcases } from './testcase';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const resultSubmissions = pgTable('result_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  actualOutput: text('actual_output'),
  isPassed: boolean('is_passed').default(false).notNull(),
  executionTime: real('execution_time'),
  memoryUse: real('memory_use'),
  error: text('error'),
  testcaseId: uuid('testcase_id')
    .references(() => testcases.id)
    .notNull(),
  submissionId: uuid('submission_id')
    .references(() => submissions.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ResultSubmissionEntity = typeof resultSubmissions.$inferSelect;
export type ResultSubmissionInsert = typeof resultSubmissions.$inferInsert;

export const insertResultSubmissionSchema = createInsertSchema(resultSubmissions, {
  actualOutput: z.string().optional(),
  isPassed: z.boolean().optional(),
  executionTime: z.number().optional(),
  memoryUse: z.number().optional(),
  error: z.string().optional(),
  testcaseId: z.string().uuid(),
  submissionId: z.string().uuid(),
});

export const selectResultSubmissionSchema = createSelectSchema(resultSubmissions);
