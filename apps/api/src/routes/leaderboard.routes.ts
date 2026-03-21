import { Router } from 'express';
import { LeaderboardController } from '@backend/api/controllers/leaderboard.controller';
import { createLeaderboardService } from '@backend/api/services/leaderboard.service';
import { rateLimitMiddleware } from '@backend/api/middlewares/ratelimit.middleware';

/** Creates the leaderboard router without instantiating repository dependencies at import time. */
export function createLeaderboardRouter(): Router {
  const router = Router();
  const leaderboardReadLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many leaderboard requests, please try again later.',
  });

  const leaderboardService = createLeaderboardService();
  const leaderboardController = new LeaderboardController(leaderboardService);

  router.get('/', leaderboardReadLimit, leaderboardController.getLeaderboard.bind(leaderboardController));
  router.get('/top', leaderboardReadLimit, leaderboardController.getTopUsers.bind(leaderboardController));
  router.get(
    '/stats',
    leaderboardReadLimit,
    leaderboardController.getLeaderboardStats.bind(leaderboardController)
  );
  router.get(
    '/user/:userId',
    leaderboardReadLimit,
    leaderboardController.getUserRank.bind(leaderboardController)
  );
  router.get(
    '/user/:userId/context',
    leaderboardReadLimit,
    leaderboardController.getUserRankContext.bind(leaderboardController)
  );

  return router;
}