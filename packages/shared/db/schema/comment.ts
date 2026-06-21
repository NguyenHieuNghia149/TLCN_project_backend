import { index, pgTable, timestamp, uuid, varchar, boolean, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './user';
import { lessons } from './lesson';
import { problems } from './problem';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    content: varchar('content', { length: 1000 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id),
    problemId: uuid('problem_id').references(() => problems.id),
    parentCommentId: uuid('parent_comment_id'),
    // Pin feature columns
    isPinned: boolean('is_pinned').default(false).notNull(),
    pinnedByAdminId: uuid('pinned_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
    pinnedAt: timestamp('pinned_at'),
    // Like feature column (cached count for performance)
    likeCount: integer('like_count').default(0).notNull(),
  },
  table => [
    index('idx_comments_lesson_parent').on(table.lessonId, table.parentCommentId),
    index('idx_comments_problem_parent').on(table.problemId, table.parentCommentId),
    index('idx_comments_parent').on(table.parentCommentId),
    // Index for efficient pinned comment queries
    index('idx_comments_is_pinned_created_at').on(table.isPinned, table.createdAt),
  ],
);

export type CommentEntity = typeof comments.$inferSelect;
export type CommentInsert = typeof comments.$inferInsert;

export const insertCommentSchema = createInsertSchema(comments, {
  content: z.string().min(1, 'Content is required'),
  userId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  problemId: z.string().uuid().optional(),
  parentCommentId: z.string().uuid().optional(),
  isPinned: z.boolean().optional(),
  pinnedByAdminId: z.string().uuid().optional(),
  pinnedAt: z.date().optional(),
  likeCount: z.number().int().nonnegative().optional(),
});

export const selectCommentSchema = createSelectSchema(comments);