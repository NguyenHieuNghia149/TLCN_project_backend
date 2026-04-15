import { Router } from 'express';
import { CommentController } from '@backend/api/controllers/comment.controller';
import { authenticationToken, optionalAuth } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { createCommentService } from '@backend/api/services/comment.service';
import { createCommentLikeService } from '@backend/api/services/commentLike.service';

/** Creates the comment router without constructing controllers at import time. */
export function createCommentRouter(): Router {
  const router = Router();
  const commentService = createCommentService();
  const commentLikeService = createCommentLikeService();
  const controller = new CommentController(commentService, commentLikeService);

  const generalLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP, please try again later.',
  });

  const createLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many comment requests from this IP, please try again later.',
  });

  router.post('/', authenticationToken, createLimit, controller.createComment);
  router.get('/lesson/:lessonId', generalLimit, optionalAuth, controller.getByLesson);
  router.get('/problem/:problemId', generalLimit, optionalAuth, controller.getByProblem);
  router.get('/:commentId/replies', generalLimit, optionalAuth, controller.getReplies);
  router.put('/:id', authenticationToken, createLimit, controller.updateComment);
  router.delete('/:id', authenticationToken, createLimit, controller.deleteComment);

  // Pin/Unpin endpoints (admin only)
  router.post('/:id/pin', authenticationToken, createLimit, controller.pinComment);
  router.delete('/:id/pin', authenticationToken, createLimit, controller.unpinComment);

  // Like endpoints
  router.post('/:id/like', authenticationToken, createLimit, controller.toggleLikeComment);
  router.get('/:id/like-status', generalLimit, optionalAuth, controller.getCommentLikeStatus);
  
  // Batch like status (to prevent N+1 queries)
  router.get('/like-status/batch', generalLimit, optionalAuth, controller.getBatchLikeStatus);

  return router;
}
