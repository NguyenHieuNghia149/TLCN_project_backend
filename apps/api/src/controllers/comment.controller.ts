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

  createComment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
    } as any;

    const created = await this.commentService.createComment(payload);

    res.status(201).json({ message: 'Comment created', ...created });
  };

  getByLesson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { lessonId } = req.params as any;
    if (!lessonId) {
      throw new AppException('lessonId required', 400, 'MISSING_LESSON_ID');
    }

    const comments = await this.commentService.getCommentsByLesson(lessonId);
    res.status(200).json(comments);
  };

  getByProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { problemId } = req.params as any;
    if (!problemId) {
      throw new AppException('problemId required', 400, 'MISSING_PROBLEM_ID');
    }

    const comments = await this.commentService.getCommentsByProblem(problemId);
    res.status(200).json(comments);
  };

  getReplies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { commentId } = req.params as any;
    if (!commentId) {
      throw new AppException('commentId required', 400, 'MISSING_COMMENT_ID');
    }

    const replies = await this.commentService.getReplies(commentId);
    res.status(200).json(replies);
  };

  deleteComment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { id } = req.params as any;
    if (!id) {
      throw new AppException('id required', 400, 'MISSING_ID');
    }

    const deleted = await this.commentService.deleteComment(id, userId, userRole);
    if (!deleted) {
      throw new AppException('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }

    res.status(200).json({ message: 'Comment deleted' });
  };

  updateComment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as any;
    const { content } = req.body as any;

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
  };

  /**
   * Pin a comment (admin only)
   * POST /api/comments/:id/pin
   */
  pinComment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as any;
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
    } catch (error: any) {
      // Map service errors to HTTP responses
      if (error.message.includes('admin')) {
        throw new AppException(error.message, 403, 'FORBIDDEN');
      }
      if (error.message.includes('not found')) {
        throw new AppException(error.message, 404, 'NOT_FOUND');
      }
      if (error.message.includes('already pinned')) {
        throw new AppException(error.message, 400, 'ALREADY_PINNED');
      }
      throw error;
    }
  };

  /**
   * Unpin a comment (admin only)
   * DELETE /api/comments/:id/pin
   */
  unpinComment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as any;
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
    } catch (error: any) {
      if (error.message.includes('admin')) {
        throw new AppException(error.message, 403, 'FORBIDDEN');
      }
      if (error.message.includes('not found')) {
        throw new AppException(error.message, 404, 'NOT_FOUND');
      }
      if (error.message.includes('not pinned')) {
        throw new AppException(error.message, 400, 'NOT_PINNED');
      }
      throw error;
    }
  };

  /**
   * Toggle like on a comment
   * POST /api/comments/:id/like
   */
  toggleLikeComment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      throw new AppException('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params as any;
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
    } catch (error: any) {
      if (error.message.includes('not found')) {
        throw new AppException(error.message, 404, 'NOT_FOUND');
      }
      throw error;
    }
  };

  /**
   * Get like status for a comment
   * GET /api/comments/:id/like-status
   * Works with optional auth (unauthenticated users get userHasLiked: false)
   */
  getCommentLikeStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId || undefined;
    const { id } = req.params as any;

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
    } catch (error: any) {
      if (error.message.includes('not found')) {
        throw new AppException(error.message, 404, 'NOT_FOUND');
      }
      throw error;
    }
  };

  /**
   * Get batch like status for multiple comments
   * GET /api/comments/like-status/batch?ids=id1,id2,...
   * Works with optional auth
   */
  getBatchLikeStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.user?.userId || undefined;
    const { ids } = req.query as any;

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
    } catch (error: any) {
      throw error;
    }
  };
}
