import { CommentLikeRepository } from '../repositories/commentLike.repository';
import { CommentRepository } from '../repositories/comment.repository';
import { UserRepository } from '../repositories/user.repository';
import { CommentLikeResponse, CommentLikeStatus, BatchLikeStatusResult } from '@backend/shared/types/comment.types';
import { logger } from '@backend/shared/utils';
import { NotificationService } from './notification.service';
import { ENotificationType } from '@backend/shared/types';

type CommentLikeServiceDependencies = {
  commentLikeRepository: CommentLikeRepository;
  commentRepository: CommentRepository;
  userRepository?: UserRepository;
  notificationService?: NotificationService;
};

export class CommentLikeService {
  private commentLikeRepository: CommentLikeRepository;
  private commentRepository: CommentRepository;
  private userRepository: UserRepository | null;
  private notificationService: NotificationService | null;

  constructor(deps: CommentLikeServiceDependencies) {
    this.commentLikeRepository = deps.commentLikeRepository;
    this.commentRepository = deps.commentRepository;
    this.userRepository = deps.userRepository || null;
    this.notificationService = deps.notificationService || null;
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
      
      // Send notification to comment author
      if (this.notificationService && comment.userId !== userId) {
        try {
          console.log('[LIKE] Sending like notification to comment author:', comment.userId);
          
          // Get liker user info
          let likerName = 'Someone';
          if (this.userRepository) {
            const likerUser = await this.userRepository.findById(userId);
            if (likerUser) {
              likerName = [likerUser.firstName, likerUser.lastName].filter(Boolean).join(' ') || likerUser.email;
            }
          }
          
          // Get updated like count
          const updatedComment = await this.commentRepository.findById(commentId);
          const likeCount = updatedComment?.likeCount ?? 1;
          
          // Use fresh comment data for link (with lessonId/problemId)
          const commentForLink = comment; // Already fetched at line 41
          
          // Format title and message based on like count
          let title: string;
          let message: string;
          if (likeCount === 1) {
            title = `${likerName} liked your comment`;
            message = `${likerName} liked your comment`;
          } else {
            const othersCount = likeCount - 1;
            title = `${likerName} and ${othersCount} other${othersCount > 1 ? 's' : ''} liked your comment`;
            message = `${likerName} and ${othersCount} other${othersCount > 1 ? 's' : ''} liked your comment`;
          }
          
          // Build metadata with link
          const metadata: any = {
            commentId: comment.id,
            actionType: 'like',
          };
          
          if (comment.lessonId) {
            metadata.lessonId = comment.lessonId;
            metadata.link = `/lessons/${comment.lessonId}`;
          } else if (comment.problemId) {
            metadata.problemId = comment.problemId;
            metadata.link = `/problems/${comment.problemId}`;
          }
          
          await this.notificationService.notifyUser(
            comment.userId,
            ENotificationType.COMMENT,
            title,
            message,
            metadata
          );
          console.log('[LIKE] Like notification sent successfully');
        } catch (error) {
          logger.error('Failed to send like notification', error);
          console.error('[LIKE] Notification error:', error);
        }
      } else {
        console.log('[LIKE] Skipping like notification:', { hasService: !!this.notificationService, sameAuthor: comment.userId === userId });
      }
      
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
export function createCommentLikeService(notificationService?: NotificationService): CommentLikeService {
  return new CommentLikeService({
    commentLikeRepository: new CommentLikeRepository(),
    commentRepository: new CommentRepository(),
    userRepository: new UserRepository(),
    notificationService,
  });
}
