import { pgTable, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { topic } from './topic';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const lesson = pgTable('lessons', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  topicId: uuid('topic_id')
    .references(() => topic.id)
    .notNull(),
});

export type LessonEntity = typeof lesson.$inferSelect;
export type LessonInsert = typeof lesson.$inferInsert;

export const insertLessonSchema = createInsertSchema(lesson, {
  title: z.string().min(1, 'Title is required'),
  content: z.string().optional(),
  topicId: z.string().uuid('Invalid topicId'),
});

export const selectLessonSchema = createSelectSchema(lesson);
