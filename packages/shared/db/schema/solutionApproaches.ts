import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
} from 'drizzle-orm/pg-core';
import { solutions } from './solution';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const solutionApproaches = pgTable('solution_approaches', {
  id: uuid('id').defaultRandom().primaryKey(),
  solutionId: uuid('solution_id')
    .references(() => solutions.id)
    .notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  timeComplexity: varchar('time_complexity', { length: 100 }),
  spaceComplexity: varchar('space_complexity', { length: 100 }),
  explanation: text('explanation'),
  order: integer('order').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SolutionApproachEntity = typeof solutionApproaches.$inferSelect;
export type SolutionApproachInsert = typeof solutionApproaches.$inferInsert;

export const insertSolutionApproachSchema = createInsertSchema(solutionApproaches, {
  solutionId: z.string().uuid('Invalid solution ID'),
  title: z.string().min(1, 'Approach title is required'),
  description: z.string().optional(),
  timeComplexity: z.string().optional(),
  spaceComplexity: z.string().optional(),
  explanation: z.string().optional(),
  order: z.number().int().min(1, 'Order must be at least 1'),
});

export const selectSolutionApproachSchema = createSelectSchema(solutionApproaches);
