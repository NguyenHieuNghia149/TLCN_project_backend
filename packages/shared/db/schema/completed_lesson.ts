import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { lessons } from './lesson';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const learnedLessons = pgTable('learned_lessons', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  lessonId: uuid('lesson_id')
    .references(() => lessons.id)
    .notNull(),
  completedAt: timestamp('completed_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type LearnedLessonEntity = typeof learnedLessons.$inferSelect;
export type LearnedLessonInsert = typeof learnedLessons.$inferInsert;

export const insertLearnedLessonSchema = createInsertSchema(learnedLessons, {
  userId: z.string().uuid('Invalid userId'),
  lessonId: z.string().uuid('Invalid lessonId'),
});

export const selectLearnedLessonSchema = createSelectSchema(learnedLessons);
