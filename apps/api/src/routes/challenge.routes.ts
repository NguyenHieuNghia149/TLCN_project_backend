import { Router } from 'express';
import {
  ChallengeController,
  CreateChallengeSchema,
  UpdateChallengeSchema,
  UpdateSolutionVisibilitySchema,
} from '@backend/api/controllers/challenge.controller';
import { ChallengeService } from '@backend/api/services/challenge.service';
import {
  authenticationToken,
  requireTeacher,
  requireTeacherOrOwner,
  optionalAuth,
} from '@backend/api/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';
import { validate } from '@backend/api/middlewares/validate.middleware';

/** Creates the challenge router without instantiating services at import time. */
export function createChallengeRouter(): Router {
  const router = Router();
  const challengeService = new ChallengeService();
  const challengeController = new ChallengeController(challengeService);

  const challengeRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many challenge requests from this IP, please try again later.',
  });

  const createChallengeRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many challenge creation requests from this IP, please try again later.',
  });

  router.get(
    '/problems/topic/:topicId',
    challengeRateLimit,
    optionalAuth,
    challengeController.listProblemsByTopic.bind(challengeController)
  );

  router.get(
    '/tags',
    challengeRateLimit,
    optionalAuth,
    challengeController.getAllTags.bind(challengeController)
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

  router.post(
    '/create',
    authenticationToken,
    requireTeacherOrOwner,
    createChallengeRateLimit,
    validate(CreateChallengeSchema),
    challengeController.createChallenge.bind(challengeController)
  );

  router.get(
    '/all',
    authenticationToken,
    requireTeacherOrOwner,
    challengeRateLimit,
    challengeController.getAllChallenges.bind(challengeController)
  );

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
    validate(UpdateChallengeSchema),
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

  router.get('/health', challengeRateLimit, (req, res) => {
    res.json({
      status: 'ok',
      service: 'challenge',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
