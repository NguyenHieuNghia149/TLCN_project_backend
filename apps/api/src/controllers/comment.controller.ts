import { Request, Response, NextFunction } from 'express';
import { CommentService } from '@backend/api/services/comment.service';
import { AuthenticatedRequest } from '@backend/api/middlewares/auth.middleware';
import { createCommentSchema } from '@backend/shared/validations/comment.validation';
import { AppException } from '@backend/api/exceptions/base.exception';

export class CommentController {
  constructor(private readonly commentService: CommentService) {}

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
}
