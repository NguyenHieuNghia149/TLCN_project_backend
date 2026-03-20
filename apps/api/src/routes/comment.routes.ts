import { Router } from 'express';
import { CommentController } from '@backend/api/controllers/comment.controller';
import { authenticationToken, optionalAuth } from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';

/** Creates the comment router without constructing controllers at import time. */
export function createCommentRouter(): Router {
  const router = Router();
  const controller = new CommentController();

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

  return router;
}
