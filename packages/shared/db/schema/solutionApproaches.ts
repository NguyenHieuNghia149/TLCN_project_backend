import { pgTable, uuid, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { solutions } from './solution';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const solutionApproaches = pgTable('solution_approaches', {
  id: uuid('id').defaultRandom().primaryKey(),
  solutionId: uuid('solution_id')
    .references(() => solutions.id)
    .notNull(),
  title: varchar('title', { length: 255 }).notNull(), // e.g., "Brute Force", "Prefix & Suffix"
  description: text('description'),
  sourceCode: text('source_code').notNull(),
  language: varchar('language', { length: 50 }).notNull().default('cpp'),
  timeComplexity: varchar('time_complexity', { length: 100 }), // e.g., "O(n^2)", "O(n)"
  spaceComplexity: varchar('space_complexity', { length: 100 }), // e.g., "O(1)", "O(n)"
  explanation: text('explanation'), // Detailed explanation of the approach
  order: integer('order').notNull().default(1), // Order of approaches (1, 2, 3, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SolutionApproachEntity = typeof solutionApproaches.$inferSelect;
export type SolutionApproachInsert = typeof solutionApproaches.$inferInsert;

export const insertSolutionApproachSchema = createInsertSchema(solutionApproaches, {
  solutionId: z.string().uuid('Invalid solution ID'),
  title: z.string().min(1, 'Approach title is required'),
  description: z.string().optional(),
  sourceCode: z.string().min(1, 'Source code is required'),
  language: z.string().min(1, 'Programming language is required'),
  timeComplexity: z.string().optional(),
  spaceComplexity: z.string().optional(),
  explanation: z.string().optional(),
  order: z.number().int().min(1, 'Order must be at least 1'),
});

export const selectSolutionApproachSchema = createSelectSchema(solutionApproaches);
