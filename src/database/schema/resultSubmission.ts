import { pgTable, uuid, text, boolean, real } from 'drizzle-orm/pg-core';
import { submissions } from './submission';
import { testcases } from './testcase';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const resultSubmission = pgTable('result_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  actualOutput: text('actual_output'),
  isPassed: boolean('is_passed').default(false).notNull(),
  executionTime: real('execution_time'),
  memoryUse: real('memory_use'),
  testcaseId: uuid('testcase_id')
    .references(() => testcases.id)
    .notNull(),
  submissionId: uuid('submission_id')
    .references(() => submissions.id)
    .notNull(),
});

export type ResultSubmissionEntity = typeof resultSubmission.$inferSelect;
export type ResultSubmissionInsert = typeof resultSubmission.$inferInsert;

export const insertResultSubmissionSchema = createInsertSchema(resultSubmission, {
  actualOutput: z.string().optional(),
  isPassed: z.boolean().optional(),
  executionTime: z.number().optional(),
  memoryUse: z.number().optional(),
  testcaseId: z.string().uuid(),
  submissionId: z.string().uuid(),
});

export const selectResultSubmissionSchema = createSelectSchema(resultSubmission);
