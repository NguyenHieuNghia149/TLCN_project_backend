import { Router, Request, Response, NextFunction } from 'express';
import { LeaderboardController } from '@/controllers/leaderboard.controller';
import { LeaderboardService } from '@/services/leaderboard.service';
import { LeaderboardRepository } from '@/repositories/leaderboard.repository';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';

const router = Router();

// Rate limiting
const leaderboardReadLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: 'Too many leaderboard requests, please try again later.',
});

// Initialize repository, service, and controller
const leaderboardRepository = new LeaderboardRepository();
const leaderboardService = new LeaderboardService(leaderboardRepository);
const leaderboardController = new LeaderboardController(leaderboardService);

/**
 * GET /api/leaderboard
 * Get paginated leaderboard
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 * - search: string (optional, for searching users by name/email)
 */
router.get(
  '/',
  leaderboardReadLimit,
  leaderboardController.getLeaderboard.bind(leaderboardController)
);

/**
 * GET /api/leaderboard/top
 * Get top N users
 * Query params:
 * - limit: number (default: 10, max: 100)
 */
router.get(
  '/top',
  leaderboardReadLimit,
  leaderboardController.getTopUsers.bind(leaderboardController)
);

/**
 * GET /api/leaderboard/stats
 * Get leaderboard statistics
 */
router.get(
  '/stats',
  leaderboardReadLimit,
  leaderboardController.getLeaderboardStats.bind(leaderboardController)
);

/**
 * GET /api/leaderboard/user/:userId
 * Get user's rank information
 */
router.get(
  '/user/:userId',
  leaderboardReadLimit,
  leaderboardController.getUserRank.bind(leaderboardController)
);

/**
 * GET /api/leaderboard/user/:userId/context
 * Get users around a specific user rank
 * Query params:
 * - contextSize: number (default: 5)
 */
router.get(
  '/user/:userId/context',
  leaderboardReadLimit,
  leaderboardController.getUserRankContext.bind(leaderboardController)
);

export default router;
