import { pgTable, uuid, varchar, text, integer } from 'drizzle-orm/pg-core';
import { lesson } from './lesson';
import { topic } from './topic';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const problem = pgTable('problems', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  difficult: varchar('difficult', { length: 20 }).notNull().default('easy'),
  constraint: text('constraint'),
  tags: text('tags'),
  lessonId: uuid('lesson_id').references(() => lesson.id),
  topicId: uuid('topic_id').references(() => topic.id),
});

export type ProblemEntity = typeof problem.$inferSelect;
export type ProblemInsert = typeof problem.$inferInsert;

export const insertProblemSchema = createInsertSchema(problem, {
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
});

export const selectProblemSchema = createSelectSchema(problem);
