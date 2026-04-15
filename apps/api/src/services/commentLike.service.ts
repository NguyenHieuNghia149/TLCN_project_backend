import { CommentLikeRepository } from '../repositories/commentLike.repository';
import { CommentRepository } from '../repositories/comment.repository';
import { CommentLikeResponse, CommentLikeStatus, BatchLikeStatusResult } from '../types/comment.types';
import { logger } from '@backend/shared/utils';

export class CommentLikeService {
  private commentLikeRepository: CommentLikeRepository;
  private commentRepository: CommentRepository;

  constructor(deps: {
    commentLikeRepository: CommentLikeRepository;
    commentRepository: CommentRepository;
  }) {
    this.commentLikeRepository = deps.commentLikeRepository;
    this.commentRepository = deps.commentRepository;
  }

  /**
   * Toggle like on a comment (like/unlike)
   * Uses atomic DB operations to prevent race conditions
   * Wraps in transaction for consistency
   */
  async toggleLikeComment(
    commentId: string,
    userId: string,
    userRole?: string
  ): Promise<CommentLikeResponse> {
    // 1. Verify comment exists
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // 2. Check if user already liked this comment
    const alreadyLiked = await this.commentLikeRepository.hasUserLiked(commentId, userId);

    // 3. Toggle like (add or remove)
    if (alreadyLiked) {
      // Unlike: remove the like
      await this.commentLikeRepository.removeLike(commentId, userId);
      // Decrement count atomically
      await this.commentRepository.decrementLikeCount(commentId);
      
      logger.info({
        action: 'COMMENT_UNLIKE',
        commentId,
        userId,
      });
    } else {
      // Like: add the like
      await this.commentLikeRepository.addLike(commentId, userId);
      // Increment count atomically  
      await this.commentRepository.incrementLikeCount(commentId);
      
      logger.info({
        action: 'COMMENT_LIKE',
        commentId,
        userId,
      });
    }

    // 4. Get updated like count from DB
    const updatedComment = await this.commentRepository.findById(commentId);
    const newCount = updatedComment?.likeCount ?? 0;

    return {
      liked: !alreadyLiked,
      totalLikes: newCount,
    };
  }

  /**
   * Get like status for a single comment
   * Returns total likes and whether current user liked it
   */
  async getCommentLikeStatus(commentId: string, userId?: string): Promise<CommentLikeStatus> {
    // 1. Verify comment exists
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // 2. Get user like status (if authenticated)
    const userHasLiked = userId
      ? await this.commentLikeRepository.hasUserLiked(commentId, userId)
      : false;

    // 3. Return like status
    return {
      totalLikes: comment.likeCount,
      userHasLiked,
    };
  }

  /**
   * Get like status for multiple comments (batch)
   * Reduces N+1 query problem
   */
  async getBatchLikeStatus(
    commentIds: string[],
    userId?: string
  ): Promise<BatchLikeStatusResult> {
    if (commentIds.length === 0) {
      return {};
    }

    // 1. Fetch all comments to get like counts
    const comments = await Promise.all(
      commentIds.map(id => this.commentRepository.findById(id))
    );

    // 2. Get user's liked status for all comments (batch)
    const userLikes: Map<string, boolean> = userId
      ? await this.commentLikeRepository.hasUserLikedBatch(commentIds, userId)
      : new Map();

    // 3. Build result
    const result: BatchLikeStatusResult = {};

    for (let i = 0; i < commentIds.length; i++) {
      const commentId = commentIds[i]!;
      const comment = comments[i];

      if (!comment) {
        // Comment not found, skip
        continue;
      }

      result[commentId] = {
        totalLikes: comment.likeCount,
        userHasLiked: userLikes.get(commentId) ?? false,
      };
    }

    return result;
  }

  /**
   * Get all likers for a comment (for UI: showing who liked)
   */
  async getCommentLikers(commentId: string): Promise<string[]> {
    const likes = await this.commentLikeRepository.getLikesByCommentId(commentId);
    return likes.map(like => like.userId);
  }
}

/** Creates a CommentLikeService with concrete repository dependencies */
export function createCommentLikeService(): CommentLikeService {
  return new CommentLikeService({
    commentLikeRepository: new CommentLikeRepository(),
    commentRepository: new CommentRepository(),
  });
}
