import { Router } from 'express';
import { CommentController } from '@/controllers/comment.controller';
import { authenticationToken, optionalAuth } from '@/middlewares/auth.middleware';

const router = Router();
const controller = new CommentController();

// Create comment (authenticated) - supports both root comments and replies
router.post('/', authenticationToken, controller.createComment);

// List comments by lesson
router.get('/lesson/:lessonId', optionalAuth, controller.getByLesson);

// List comments by problem
router.get('/problem/:problemId', optionalAuth, controller.getByProblem);

// Get replies for a comment
router.get('/:commentId/replies', optionalAuth, controller.getReplies);

// Update comment (authenticated)
router.put('/:id', authenticationToken, controller.updateComment);

// Delete comment (authenticated)
router.delete('/:id', authenticationToken, controller.deleteComment);

export default router;
