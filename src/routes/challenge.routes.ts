import { Router } from 'express';
import {
  ChallengeController,
  CreateChallengeSchema,
  ListProblemsByTopicSchema,
  UpdateSolutionVisibilitySchema,
} from '@/controllers/challenge.controller';
import { ChallengeService } from '@/services/challenge.service';
import {
  authenticationToken,
  requireTeacher,
  requireTeacherOrOwner,
  optionalAuth,
} from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';

const router = Router();
const challengeService = new ChallengeService();
const challengeController = new ChallengeController(challengeService);

// Rate limiting
const challengeRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 100 requests per windowMs
  message: 'Too many challenge requests from this IP, please try again later.',
});

const createChallengeRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 10 challenge creation requests per windowMs
  message: 'Too many challenge creation requests from this IP, please try again later.',
});

// Public routes
router.get(
  '/problems/topic/:topicId',
  challengeRateLimit,
  optionalAuth,
  // validate(ListProblemsByTopicSchema),
  challengeController.listProblemsByTopic.bind(challengeController)
);

router.get(
  '/topics/:topicId/tags',
  challengeRateLimit,
  optionalAuth,
  challengeController.getTopicTags.bind(challengeController)
);

router.get(
  '/topics/:topicId/problems',
  challengeRateLimit,
  optionalAuth,
  challengeController.listProblemsByTopicAndTags.bind(challengeController)
);

// Protected routes (require authentication)
router.post(
  '/create',
  authenticationToken,
  requireTeacherOrOwner,
  createChallengeRateLimit,
  validate(CreateChallengeSchema),
  challengeController.createChallenge.bind(challengeController)
);

// ⚠️ IMPORTANT: /all MUST come BEFORE /:challengeId to avoid route collision
// Admin route to get all challenges with pagination
router.get('/all', authenticationToken, challengeRateLimit, async (req, res, next) => {
  try {
    console.log('📋 [GET /all] Request received:', { query: req.query });

    // TODO: Implement proper getAllChallenges in ChallengeService
    // For now, return empty list to prevent 500 errors
    res.json({
      success: true,
      data: {
        items: [],
        total: 0,
      },
    });
  } catch (error) {
    console.error('❌ [GET /all] Error:', error);
    next(error);
  }
});

router.get(
  '/:challengeId',
  challengeRateLimit,
  optionalAuth,
  challengeController.getChallengeById.bind(challengeController)
);

router.put(
  '/:challengeId',
  authenticationToken,
  requireTeacherOrOwner,
  challengeRateLimit,
  validate(CreateChallengeSchema),
  challengeController.updateChallenge.bind(challengeController)
);

router.delete(
  '/:challengeId',
  authenticationToken,
  requireTeacherOrOwner,
  challengeRateLimit,
  challengeController.deleteChallenge.bind(challengeController)
);

router.patch(
  '/solutions/:solutionId/visibility',
  authenticationToken,
  requireTeacher,
  challengeRateLimit,
  validate(UpdateSolutionVisibilitySchema),
  challengeController.updateSolutionVisibility.bind(challengeController)
);

// Health check for challenge service
router.get('/health', challengeRateLimit, (req, res) => {
  res.json({
    status: 'ok',
    service: 'challenge',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
router.use(ChallengeController.errorHandler);

export default router;
