import { Router, Request, Response, NextFunction } from 'express';
import { LeaderboardController } from '@/controllers/leaderboard.controller';
import { LeaderboardService } from '@/services/leaderboard.service';
import { LeaderboardRepository } from '@/repositories/leaderboard.repository';

const router = Router();

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
router.get('/', (req: Request, res: Response, next: NextFunction) =>
  leaderboardController.getLeaderboard(req, res, next)
);

/**
 * GET /api/leaderboard/top
 * Get top N users
 * Query params:
 * - limit: number (default: 10, max: 100)
 */
router.get('/top', (req: Request, res: Response, next: NextFunction) =>
  leaderboardController.getTopUsers(req, res, next)
);

/**
 * GET /api/leaderboard/stats
 * Get leaderboard statistics
 */
router.get('/stats', (req: Request, res: Response, next: NextFunction) =>
  leaderboardController.getLeaderboardStats(req, res, next)
);

/**
 * GET /api/leaderboard/user/:userId
 * Get user's rank information
 */
router.get('/user/:userId', (req: Request, res: Response, next: NextFunction) =>
  leaderboardController.getUserRank(req, res, next)
);

/**
 * GET /api/leaderboard/user/:userId/context
 * Get users around a specific user rank
 * Query params:
 * - contextSize: number (default: 5)
 */
router.get('/user/:userId/context', (req: Request, res: Response, next: NextFunction) =>
  leaderboardController.getUserRankContext(req, res, next)
);

// Error handler
router.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  LeaderboardController.errorHandler(error, req, res, next);
});

export default router;
