import { index, pgTable, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './user';
import { comments } from './comment';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * CommentLike table
 * Tracks individual user likes on comments
 * UNIQUE constraint ensures one like per user per comment
 * Cascade delete when comment is deleted
 */
export const commentLikes = pgTable(
  'comment_likes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    commentId: uuid('comment_id')
      .references(() => comments.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    // Prevent duplicate likes: one like per user per comment
    uniqueIndex('unique_comment_user_like').on(table.commentId, table.userId),
    // Speed up: find likes for a specific comment
    index('idx_comment_likes_comment_id').on(table.commentId),
    // Speed up: find all likes by a user
    index('idx_comment_likes_user_id').on(table.userId),
  ],
);

export type CommentLikeEntity = typeof commentLikes.$inferSelect;
export type CommentLikeInsert = typeof commentLikes.$inferInsert;

export const insertCommentLikeSchema = createInsertSchema(commentLikes, {
  commentId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const selectCommentLikeSchema = createSelectSchema(commentLikes);
