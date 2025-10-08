import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const solutions = pgTable('solutions', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  videoUrl: varchar('video_url', { length: 1024 }),
  imageUrl: varchar('image_url', { length: 1024 }),
  sourceCode: text('source_code'),
  description: text('description'),
  problemId: uuid('problem_id')
    .references(() => problems.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SolutionEntity = typeof solutions.$inferSelect;
export type SolutionInsert = typeof solutions.$inferInsert;

export const insertSolutionSchema = createInsertSchema(solutions, {
  title: z.string().min(1),
  videoUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  sourceCode: z.string().optional(),
  description: z.string().optional(),
  problemId: z.string().uuid(),
});

export const selectSolutionSchema = createSelectSchema(solutions);
