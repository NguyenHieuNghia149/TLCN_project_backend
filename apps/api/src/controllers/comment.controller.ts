import { Request, Response, NextFunction } from 'express';
import { CommentService } from '@backend/api/services/comment.service';
import { CommentLikeService } from '@backend/api/services/commentLike.service';
import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { createCommentSchema } from '@backend/shared/validations/comment.validation';
import { AppException } from '@backend/api/exceptions/base.exception';

export class CommentController {
  constructor(
    private readonly commentService: CommentService,
    private readonly commentLikeService: CommentLikeService
  ) {}

  async createComment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parsed = createCommentSchema.parse({ body: req.body });

    const payload = {
      content: parsed.body.content,
      userId,
      lessonId: parsed.body.lessonId,
      problemId: parsed.body.problemId,
      parentCommentId: parsed.body.parentCommentId,
    };

    const created = await this.commentService.createComment(payload as Parameters<CommentService['createComment']>[0]);

    res.status(201).json({ message: 'Comment created', ...created });
  }

  async getByLesson(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { lessonId } = req.params as { lessonId: string };
    if (!lessonId) {
      throw new AppException('lessonId required', 400, 'MISSING_LESSON_ID');
    }

    const comments = await this.commentService.getCommentsByLesson(lessonId);
    res.status(200).json(comments);
  }

  async getByProblem(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { problemId } = req.params as { problemId: string };
    if (!problemId) {
      throw new AppException('problemId required', 400, 'MISSING_PROBLEM_ID');
    }

    const comments = await this.commentService.getCommentsByProblem(problemId);
    res.status(200).json(comments);
  }

  async getReplies(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { commentId } = req.params as { commentId: string };
    if (!commentId) {
      throw new AppException('commentId required', 400, 'MISSING_COMMENT_ID');
    }

    const replies = await this.commentService.getReplies(commentId);
    res.status(200).json(replies);
  }

  async deleteComment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { id } = req.params as { id: string };
    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }

    const deleted = await this.commentService.deleteComment(id, userId, userRole);
    if (!deleted) {
      throw new AppException('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }

    res.status(200).json({ message: 'Comment deleted' });
  }

  async updateComment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as { id: string };
    const { content } = req.body as { content: string };

    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new AppException('content is required and must be non-empty', 400, 'INVALID_CONTENT');
    }

    const updated = await this.commentService.updateComment(id, content.trim(), userId);
    if (!updated) {
      throw new AppException('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }

    res.status(200).json({ message: 'Comment updated', ...updated });
  }

  /**
   * Pin a comment (admin only)
   * POST /api/comments/:id/pin
   */
  async pinComment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as { id: string };
    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }

    try {
      const result = await this.commentService.pinCommentAsAdmin(id, userId, userRole);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('admin')) {
        throw new AppException(err.message, 403, 'FORBIDDEN');
      }
      if (err.message.includes('not found')) {
        throw new AppException(err.message, 404, 'NOT_FOUND');
      }
      if (err.message.includes('already pinned')) {
        throw new AppException(err.message, 400, 'ALREADY_PINNED');
      }
      throw err;
    }
  }

  /**
   * Unpin a comment (admin only)
   * DELETE /api/comments/:id/pin
   */
  async unpinComment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as { id: string };
    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }

    try {
      const result = await this.commentService.unpinCommentAsAdmin(id, userId, userRole);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('admin')) {
        throw new AppException(err.message, 403, 'FORBIDDEN');
      }
      if (err.message.includes('not found')) {
        throw new AppException(err.message, 404, 'NOT_FOUND');
      }
      if (err.message.includes('not pinned')) {
        throw new AppException(err.message, 400, 'NOT_PINNED');
      }
      throw err;
    }
  }

  /**
   * Toggle like on a comment
   * POST /api/comments/:id/like
   */
  async toggleLikeComment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as { id: string };
    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }

    try {
      const result = await this.commentLikeService.toggleLikeComment(id, userId, userRole);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('not found')) {
        throw new AppException(err.message, 404, 'NOT_FOUND');
      }
      throw err;
    }
  }

  /**
   * Get like status for a comment
   * GET /api/comments/:id/like-status
   * Works with optional auth (unauthenticated users get userHasLiked: false)
   */
  async getCommentLikeStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId || undefined;
    const { id } = req.params as { id: string };

    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }

    try {
      const result = await this.commentLikeService.getCommentLikeStatus(id, userId);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('not found')) {
        throw new AppException(err.message, 404, 'NOT_FOUND');
      }
      throw err;
    }
  }

  /**
   * Get batch like status for multiple comments
   * GET /api/comments/like-status/batch?ids=id1,id2,...
   * Works with optional auth
   */
  async getBatchLikeStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId || undefined;
    const { ids } = req.query as { ids?: string };

    if (!ids || typeof ids !== 'string') {
      throw new AppException('ids query parameter required (comma-separated)', 400, 'INVALID_IDS');
    }

    const commentIds = ids.split(',').filter((id: string) => id.trim());
    if (commentIds.length === 0) {
      throw new AppException('At least one comment ID required', 400, 'INVALID_IDS');
    }

    try {
      const result = await this.commentLikeService.getBatchLikeStatus(commentIds, userId);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: unknown) {
      throw error;
    }
  }
}
