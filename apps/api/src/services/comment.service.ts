import {
  CommentRepository,
  CommentWithUser,
  CommentWithReplies,
} from '../repositories/comment.repository';
import { CommentInsert, CommentEntity } from '@backend/shared/db/schema';
import { CommentPinResponse } from '../types/comment.types';
import { logger } from '@backend/shared/utils';

export class CommentService {
  private repo: CommentRepository;

  constructor(deps: { commentRepository: CommentRepository }) {
    this.repo = deps.commentRepository;
  }

  async createComment(payload: CommentInsert): Promise<CommentEntity> {
    const created = await this.repo.create(payload as CommentInsert);
    return created;
  }

  async getCommentsByLesson(lessonId: string): Promise<CommentWithReplies[]> {
    return this.repo.listByLesson(lessonId);
  }

  async getCommentsByProblem(problemId: string): Promise<CommentWithReplies[]> {
    return this.repo.listByProblem(problemId);
  }

  async getReplies(parentCommentId: string): Promise<CommentWithUser[]> {
    return this.repo.getReplies(parentCommentId);
  }

  async updateComment(id: string, content: string, userId?: string): Promise<CommentEntity | null> {
    // Ensure only author can update
    const comment = await this.repo.findById(id);
    if (!comment) return null;
    if (userId && comment.userId !== userId) {
      throw new Error('Permission denied');
    }
    return this.repo.update(id, { content } as any);
  }

  async deleteComment(id: string, userId?: string, userRole?: string): Promise<boolean> {
    // Allow deletion if:
    // 1. User is the author of the comment
    // 2. User is an owner or teacher
    const comment = await this.repo.findById(id);
    if (!comment) return false;

    const isAuthor = userId && comment.userId === userId;
    const isAdmin = userRole && (userRole === 'owner' || userRole === 'teacher');

    if (!isAuthor && !isAdmin) {
      throw new Error('Permission denied');
    }

    return this.repo.delete(id);
  }

  /**
   * Pin a comment as admin
   * Only admins (owner/teacher) can pin comments
   */
  async pinCommentAsAdmin(
    commentId: string,
    adminUserId: string,
    adminRole: string
  ): Promise<CommentPinResponse> {
    // 1. Verify user is admin
    if (adminRole !== 'owner' && adminRole !== 'teacher') {
      logger.warn(`Non-admin user ${adminUserId} attempted to pin comment ${commentId}`);
      throw new Error('Only admins (owner/teacher) can pin comments');
    }

    // 2. Verify comment exists
    const comment = await this.repo.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // 3. Verify comment is not already pinned
    if (comment.isPinned) {
      throw new Error('This comment is already pinned');
    }

    // 4. Execute pin operation
    const pinnedAt = new Date();
    await this.repo.pinComment(commentId, adminUserId, pinnedAt);

    // 5. Log operation
    logger.info({
      action: 'COMMENT_PINNED',
      commentId,
      adminId: adminUserId,
      timestamp: pinnedAt,
    });

    return {
      commentId,
      isPinned: true,
      pinnedByAdminId: adminUserId,
      pinnedAt: pinnedAt,
    };
  }

  /**
   * Unpin a comment as admin
   */
  async unpinCommentAsAdmin(
    commentId: string,
    adminUserId: string,
    adminRole: string
  ): Promise<CommentPinResponse> {
    // 1. Verify user is admin
    if (adminRole !== 'owner' && adminRole !== 'teacher') {
      logger.warn(`Non-admin user ${adminUserId} attempted to unpin comment ${commentId}`);
      throw new Error('Only admins (owner/teacher) can unpin comments');
    }

    // 2. Verify comment exists
    const comment = await this.repo.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // 3. Verify comment is currently pinned
    if (!comment.isPinned) {
      throw new Error('This comment is not pinned');
    }

    // 4. Execute unpin operation
    await this.repo.unpinComment(commentId);

    // 5. Log operation
    logger.info({
      action: 'COMMENT_UNPINNED',
      commentId,
      adminId: adminUserId,
      timestamp: new Date(),
    });

    return {
      commentId,
      isPinned: false,
    };
  }

  /**
   * Get pinned comments for a lesson
   */
  async getPinnedCommentsByLesson(lessonId: string, limit: number = 10): Promise<CommentWithReplies[]> {
    return this.repo.getPinnedCommentsByLesson(lessonId, true, limit, 0);
  }

  /**
   * Get pinned comments for a problem
   */
  async getPinnedCommentsByProblem(problemId: string, limit: number = 10): Promise<CommentWithReplies[]> {
    return this.repo.getPinnedCommentsByProblem(problemId, true, limit, 0);
  }
}

/** Creates a CommentService with concrete repository dependencies. */
export function createCommentService(): CommentService {
  return new CommentService({
    commentRepository: new CommentRepository(),
  });
}
