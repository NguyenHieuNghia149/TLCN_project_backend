import { Router } from 'express';
import { LearningProcessController } from '@/controllers/learningprocess.controller';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';

const router = Router();
const learningProcessController = new LearningProcessController();

const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 });

// Get user's complete learning progress
router.get('/user/progress', authenticationToken, generalLimit, learningProcessController.getUserProgress.bind(learningProcessController));

// Get progress for a specific topic
router.get('/topic/:topicId', authenticationToken, generalLimit, learningProcessController.getTopicProgress.bind(learningProcessController));

// Get the most recent topic with submissions
router.get('/user/recent', authenticationToken, generalLimit, learningProcessController.getRecentTopic.bind(learningProcessController));

// Get user's complete lesson progress
router.get('/lessons/user/progress', authenticationToken, generalLimit, learningProcessController.getUserLessonProgress.bind(learningProcessController));

// Get progress for a specific lesson
router.get('/lessons/:lessonId', authenticationToken, generalLimit, learningProcessController.getLessonProgress.bind(learningProcessController));

// Get the most recent lesson completed
router.get('/lessons/user/recent', authenticationToken, generalLimit, learningProcessController.getRecentLesson.bind(learningProcessController));

export default router;
