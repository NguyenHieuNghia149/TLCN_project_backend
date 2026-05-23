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

  router.post('/', authenticationToken, createLimit, controller.createComment.bind(controller));
  router.get('/lesson/:lessonId', generalLimit, optionalAuth, controller.getByLesson.bind(controller));
  router.get('/problem/:problemId', generalLimit, optionalAuth, controller.getByProblem.bind(controller));
  router.get('/:commentId/replies', generalLimit, optionalAuth, controller.getReplies.bind(controller));
  router.put('/:id', authenticationToken, createLimit, controller.updateComment.bind(controller));
  router.delete('/:id', authenticationToken, createLimit, controller.deleteComment.bind(controller));

  // Pin/Unpin endpoints (admin only)
  router.post('/:id/pin', authenticationToken, createLimit, controller.pinComment.bind(controller));
  router.delete('/:id/pin', authenticationToken, createLimit, controller.unpinComment.bind(controller));

  // Like endpoints
  router.post('/:id/like', authenticationToken, createLimit, controller.toggleLikeComment.bind(controller));
  router.get('/:id/like-status', generalLimit, optionalAuth, controller.getCommentLikeStatus.bind(controller));
  
  // Batch like status (to prevent N+1 queries)
  router.get('/like-status/batch', generalLimit, optionalAuth, controller.getBatchLikeStatus.bind(controller));

  return router;
}
