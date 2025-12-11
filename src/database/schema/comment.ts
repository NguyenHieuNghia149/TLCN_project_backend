import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './user';
import { lessons } from './lesson';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  content: varchar('content', { length: 1000 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  lessonId: uuid('lesson_id').references(() => lessons.id),
  problemId: uuid('problem_id').references(() => problems.id),
  parentCommentId: uuid('parent_comment_id'),
});

export type CommentEntity = typeof comments.$inferSelect;
export type CommentInsert = typeof comments.$inferInsert;

export const insertCommentSchema = createInsertSchema(comments, {
  content: z.string().min(1, 'Content is required'),
  userId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  problemId: z.string().uuid().optional(),
  parentCommentId: z.string().uuid().optional(),
});

export const selectCommentSchema = createSelectSchema(comments);
