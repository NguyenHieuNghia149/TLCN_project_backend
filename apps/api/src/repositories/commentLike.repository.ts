import {
  commentLikes,
  CommentLikeEntity,
  CommentLikeInsert,
} from '@backend/shared/db/schema';
import { BaseRepository } from './base.repository';
import { eq, and, inArray } from 'drizzle-orm';

export class CommentLikeRepository extends BaseRepository<
  typeof commentLikes,
  CommentLikeEntity,
  CommentLikeInsert
> {
  constructor() {
    super(commentLikes);
  }

  /**
   * Add a like to a comment
   * Silently ignores if user already liked (UNIQUE constraint)
   */
  async addLike(commentId: string, userId: string): Promise<void> {
    try {
      await this.db.insert(this.table).values({
        commentId,
        userId,
      });
    } catch (error: any) {
      // Ignore UNIQUE constraint violation - user already liked this comment
      if (error.code === '23505') {
        return;
      }
      throw error;
    }
  }

  /**
   * Remove a like from a comment
   * No-op if user hasn't liked this comment (doesn't throw error)
   */
  async removeLike(commentId: string, userId: string): Promise<void> {
    await this.db
      .delete(this.table)
      .where(
        and(
          eq(this.table.commentId, commentId),
          eq(this.table.userId, userId)
        )
      );
  }

  /**
   * Check if a user has liked a comment
   */
  async hasUserLiked(commentId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: this.table.id })
      .from(this.table)
      .where(
        and(
          eq(this.table.commentId, commentId),
          eq(this.table.userId, userId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get total like count for a comment
   * (Alternative to cached like_count in comments table for real-time count)
   */
  async getLikeCount(commentId: string): Promise<number> {
    const result = await this.db
      .select({ count: this.table.id })
      .from(this.table)
      .where(eq(this.table.commentId, commentId));

    // Count is returned as [{ count: uuid_value }], so count length
    return result.length;
  }

  /**
   * Get all likes for a comment (for UI: showing who liked)
   */
  async getLikesByCommentId(commentId: string): Promise<CommentLikeEntity[]> {
    const likes = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.commentId, commentId))
      .orderBy(this.table.createdAt);

    return likes as CommentLikeEntity[];
  }

  /**
   * Get all likes by a user
   */
  async getLikesByUserId(userId: string): Promise<CommentLikeEntity[]> {
    const likes = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.userId, userId))
      .orderBy(this.table.createdAt);

    return likes as CommentLikeEntity[];
  }

  /**
   * Batch check if user has liked multiple comments
   * Returns map of comment IDs to boolean
   */
  async hasUserLikedBatch(
    commentIds: string[],
    userId: string
  ): Promise<Map<string, boolean>> {
    if (commentIds.length === 0) {
      return new Map();
    }

    const likes = await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.userId, userId),
          // Check if comment_id is in the list
          inArray(this.table.commentId, commentIds)
        )
      );

    const likedCommentIds = new Set(likes.map(like => like.commentId));
    const result = new Map<string, boolean>();

    for (const commentId of commentIds) {
      result.set(commentId, likedCommentIds.has(commentId));
    }

    return result;
  }
}
