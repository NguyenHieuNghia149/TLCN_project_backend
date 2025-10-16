import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { topics } from './topic';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const lessons = pgTable('lessons', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  videoUrl: varchar('video_url', { length: 1024 }),
  topicId: uuid('topic_id')
    .references(() => topics.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type LessonEntity = typeof lessons.$inferSelect;
export type LessonInsert = typeof lessons.$inferInsert;

export const insertLessonSchema = createInsertSchema(lessons, {
  title: z.string().min(1, 'Title is required'),
  content: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  topicId: z.string().uuid('Invalid topicId'),
});

export const selectLessonSchema = createSelectSchema(lessons);
