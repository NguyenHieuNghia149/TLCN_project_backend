import { pgTable, uuid, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const solutions = pgTable('solutions', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  videoUrl: varchar('video_url', { length: 1024 }),
  imageUrl: varchar('image_url', { length: 1024 }),
  description: text('description'),
  problemId: uuid('problem_id')
    .references(() => problems.id)
    .notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SolutionEntity = typeof solutions.$inferSelect;
export type SolutionInsert = typeof solutions.$inferInsert;

// Validation schemas for solutions
export const insertSolutionSchema = createInsertSchema(solutions, {
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  problemId: z.string().uuid('Invalid problem ID'),
  isVisible: z.boolean().optional(),
});

export const selectSolutionSchema = createSelectSchema(solutions);

export const updateSolutionVisibilitySchema = z.object({
  isVisible: z.boolean('Invalid visibility status'),
});

// Validation schemas for solution approaches
