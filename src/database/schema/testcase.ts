import { pgTable, uuid, text, boolean, integer } from 'drizzle-orm/pg-core';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const testcases = pgTable('testcases', {
  id: uuid('id').defaultRandom().primaryKey(),
  input: text('input').notNull(),
  output: text('output').notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  point: integer('point').default(0).notNull(),
  problemId: uuid('problem_id')
    .references(() => problems.id)
    .notNull(),
});

export type TestcaseEntity = typeof testcases.$inferSelect;
export type TestcaseInsert = typeof testcases.$inferInsert;

export const insertTestcaseSchema = createInsertSchema(testcases, {
  input: z.string().min(0),
  output: z.string().min(0),
  isPublic: z.boolean().optional(),
  point: z.number().int().optional(),
  problemId: z.string().uuid(),
});

export const selectTestcaseSchema = createSelectSchema(testcases);
