import { pgTable, uuid, varchar, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { lessons } from './lesson';
import { topics } from './topic';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { ProblemVisibility } from '@/enums/problemVisibility.enum';

export const problems = pgTable('problems', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  difficult: varchar('difficult', { length: 20 }).notNull().default('easy'),
  constraint: text('constraint'),
  tags: text('tags'),
  timeLimit: integer('time_limit').default(1000), // milliseconds
  memoryLimit: varchar('memory_limit', { length: 20 }).default('128m'),
  lessonId: uuid('lesson_id').references(() => lessons.id),
  topicId: uuid('topic_id').references(() => topics.id),
  visibility: varchar('visibility', { length: 30 }).default(ProblemVisibility.PUBLIC).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ProblemEntity = typeof problems.$inferSelect;
export type ProblemInsert = typeof problems.$inferInsert;

export const insertProblemSchema = createInsertSchema(problems, {
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  difficult: z.enum(['easy', 'medium', 'hard']).default('easy'),
  constraint: z.string().optional(),
  tags: z
    .array(z.string())
    .optional()
    .transform(arr => (arr ?? []).join(',')),
  lessonId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  visibility: z.string().default(ProblemVisibility.PUBLIC),
});

export const selectProblemSchema = createSelectSchema(problems);
