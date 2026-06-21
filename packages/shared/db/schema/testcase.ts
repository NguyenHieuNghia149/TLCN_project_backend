import { index, jsonb, pgTable, uuid, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const testcases = pgTable(
  'testcases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inputJson: jsonb('input_json').$type<Record<string, unknown>>().notNull(),
    outputJson: jsonb('output_json').$type<unknown>().notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    point: integer('point').default(0).notNull(),
    problemId: uuid('problem_id')
      .references(() => problems.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [index('idx_testcases_problem_id').on(table.problemId)],
);

export type TestcaseEntity = typeof testcases.$inferSelect;
export type TestcaseInsert = typeof testcases.$inferInsert;

export const insertTestcaseSchema = createInsertSchema(testcases, {
  inputJson: z.unknown(),
  outputJson: z.unknown(),
  isPublic: z.boolean().optional(),
  point: z.number().int().optional(),
  problemId: z.string().uuid(),
});

export const selectTestcaseSchema = createSelectSchema(testcases);