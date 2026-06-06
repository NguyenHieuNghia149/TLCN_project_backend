import {
  CommentRepository,
  CommentWithUser,
  CommentWithReplies,
} from '../repositories/comment.repository';
import { UserRepository } from '../repositories/user.repository';
import { CommentInsert, CommentEntity } from '@backend/shared/db/schema';
import { CommentPinResponse } from '@backend/shared/types/comment.types';
import { logger } from '@backend/shared/utils';
import { NotificationService } from './notification.service';
import { ENotificationType } from '@backend/shared/types';

type CommentServiceDependencies = {
  commentRepository: CommentRepository;
  userRepository?: UserRepository;
  notificationService?: NotificationService;
};

export class CommentService {
  private repo: CommentRepository;
  private userRepository: UserRepository | null;
  private notificationService: NotificationService | null;

  constructor(deps: CommentServiceDependencies) {
    this.repo = deps.commentRepository;
    this.userRepository = deps.userRepository || null;
    this.notificationService = deps.notificationService || null;
  }

  async createComment(payload: CommentInsert): Promise<CommentEntity> {
    const created = await this.repo.create(payload as CommentInsert);

    // Send notification if this is a reply to another comment
    if (created.parentCommentId && this.notificationService) {
      try {
        const parentComment = await this.repo.findById(created.parentCommentId);
        if (parentComment && parentComment.userId !== created.userId) {
          
          // Get replier user info
          let replierName = 'Someone';
          if (this.userRepository) {
            const replierUser = await this.userRepository.findById(created.userId);
            if (replierUser) {
              replierName = [replierUser.firstName, replierUser.lastName].filter(Boolean).join(' ') || replierUser.email;
            }
          }
          
          const title = `${replierName} replied to your comment`;
          const message = `${replierName} replied to your comment`;
          
          // Build metadata with link
          const metadata: any = {
            commentId: created.id,
            parentId: created.parentCommentId,
            actionType: 'reply',
          };
          
          if (created.lessonId) {
            metadata.lessonId = created.lessonId;
            metadata.link = `/lessons/${created.lessonId}`;
          } else if (created.problemId) {
            metadata.problemId = created.problemId;
            metadata.link = `/problems/${created.problemId}`;
          }
          
          await this.notificationService.notifyUser(
            parentComment.userId,
            ENotificationType.COMMENT,
            title,
            message,
            metadata
          );
        }
      } catch (error) {
        logger.error('Failed to send reply notification', error);
      }
    }

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
    return this.repo.update(id, { content } as Partial<CommentInsert>);
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

    // 5. Send notification to comment author
    if (this.notificationService && comment.userId !== adminUserId) {
      try {
        
        // Get admin user info
        let adminName = 'Admin';
        if (this.userRepository) {
          const adminUser = await this.userRepository.findById(adminUserId);
          if (adminUser) {
            adminName = [adminUser.firstName, adminUser.lastName].filter(Boolean).join(' ') || adminUser.email;
          }
        }
        
        const title = 'Your comment was pinned';
        const message = `Your comment has been pinned by ${adminName}`;
        
        // Build metadata with link
        const metadata: any = {
          commentId: comment.id,
          actionType: 'pin',
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
      } catch (error) {
        logger.error('Failed to send pin notification', error);
      }
    }

    // 6. Log operation
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
export function createCommentService(notificationService?: NotificationService): CommentService {
  return new CommentService({
    commentRepository: new CommentRepository(),
    userRepository: new UserRepository(),
    notificationService,
  });
}
