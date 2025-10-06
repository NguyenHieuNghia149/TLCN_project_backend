import { pgTable, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { problem } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const solution = pgTable('solutions', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  videoUrl: varchar('video_url', { length: 1024 }),
  imageUrl: varchar('image_url', { length: 1024 }),
  sourceCode: text('source_code'),
  description: text('description'),
  problemId: uuid('problem_id')
    .references(() => problem.id)
    .notNull(),
});

export type SolutionEntity = typeof solution.$inferSelect;
export type SolutionInsert = typeof solution.$inferInsert;

export const insertSolutionSchema = createInsertSchema(solution, {
  title: z.string().min(1),
  videoUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  sourceCode: z.string().optional(),
  description: z.string().optional(),
  problemId: z.string().uuid(),
});

export const selectSolutionSchema = createSelectSchema(solution);
