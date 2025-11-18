import { Request, Response, NextFunction } from 'express';
import { CommentService } from '@/services/comment.service';
import { AuthenticatedRequest } from '@/middlewares/auth.middleware';
import { createCommentSchema } from '@/validations/comment.validation';

export class CommentController {
  private commentService: CommentService;

  constructor() {
    this.commentService = new CommentService();
  }

  createComment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const parsed = createCommentSchema.parse({ body: req.body });

      const payload = {
        content: parsed.body.content,
        userId,
        lessonId: parsed.body.lessonId,
        problemId: parsed.body.problemId,
      } as any;

      const created = await this.commentService.createComment(payload);

      res.status(201).json({ success: true, data: created, message: 'Comment created' });
    } catch (error) {
      next(error);
    }
  };

  getByLesson = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lessonId } = req.params as any;
      if (!lessonId) { res.status(400).json({ success: false, message: 'lessonId required' }); return; }

      const comments = await this.commentService.getCommentsByLesson(lessonId);
      res.status(200).json({ success: true, data: comments });
    } catch (error) {
      next(error);
    }
  };

  getByProblem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { problemId } = req.params as any;
      if (!problemId) { res.status(400).json({ success: false, message: 'problemId required' }); return; }

      const comments = await this.commentService.getCommentsByProblem(problemId);
      res.status(200).json({ success: true, data: comments });
    } catch (error) {
      next(error);
    }
  };

  deleteComment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;
      const { id } = req.params as any;
      if (!id) { res.status(400).json({ success: false, message: 'id required' }); return; }

      const deleted = await this.commentService.deleteComment(id, userId, userRole);
      if (!deleted) { res.status(404).json({ success: false, message: 'Comment not found' }); return; }

      res.status(200).json({ success: true, message: 'Comment deleted' });
    } catch (error) {
      if ((error as any).message === 'Permission denied') {
        res.status(403).json({ success: false, message: 'Permission denied' });
        return;
      }
      next(error);
    }
  };

  updateComment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const { id } = req.params as any;
      const { content } = req.body as any;

      if (!id) { res.status(400).json({ success: false, message: 'id required' }); return; }
      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ success: false, message: 'content is required and must be non-empty' });
        return;
      }

      const updated = await this.commentService.updateComment(id, content.trim(), userId);
      if (!updated) { res.status(404).json({ success: false, message: 'Comment not found' }); return; }

      res.status(200).json({ success: true, data: updated, message: 'Comment updated' });
    } catch (error) {
      if ((error as any).message === 'Permission denied') {
        res.status(403).json({ success: false, message: 'Permission denied' });
        return;
      }
      next(error);
    }
  };
}
