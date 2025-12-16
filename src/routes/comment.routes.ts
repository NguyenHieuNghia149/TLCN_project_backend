import { Router } from 'express';
import { CommentController } from '@/controllers/comment.controller';
import { authenticationToken, optionalAuth } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';

const router = Router();
const controller = new CommentController();

// Rate limiting
const generalLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
});

const createLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit comments creation
  message: 'Too many comment requests from this IP, please try again later.',
});

// Create comment (authenticated) - supports both root comments and replies
router.post('/', authenticationToken, createLimit, controller.createComment);

// List comments by lesson
router.get('/lesson/:lessonId', generalLimit, optionalAuth, controller.getByLesson);

// List comments by problem
router.get('/problem/:problemId', generalLimit, optionalAuth, controller.getByProblem);

// Get replies for a comment
router.get('/:commentId/replies', generalLimit, optionalAuth, controller.getReplies);

// Update comment (authenticated)
router.put('/:id', authenticationToken, createLimit, controller.updateComment);

// Delete comment (authenticated)
router.delete('/:id', authenticationToken, createLimit, controller.deleteComment);

export default router;
