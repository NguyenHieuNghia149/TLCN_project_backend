import { Request, Response, NextFunction } from 'express';
import { LeaderboardService } from '@/services/leaderboard.service';
import { AppException } from '@/exceptions/base.exception';

export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * Get paginated leaderboard
   * Query params:
   * - page: number (default: 1)
   * - limit: number (default: 20, max: 100)
   * - search: string (optional, for searching users by name/email)
   */
  async getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string) || undefined;

    const result = await this.leaderboardService.getLeaderboard(page, limit, search);

    res.status(200).json(result);
  }

  /**
   * Get top users
   * Query params:
   * - limit: number (default: 10, max: 100)
   */
  async getTopUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

    const result = await this.leaderboardService.getTopUsers(limit);

    res.status(200).json(result);
  }

  /**
   * Get user's rank information
   * Params:
   * - userId: string (user ID)
   */
  async getUserRank(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { userId } = req.params;

    if (!userId) {
      throw new AppException('User ID is required', 400, 'MISSING_USER_ID');
    }

    const result = await this.leaderboardService.getUserRank(userId as string);

    if (!result) {
      throw new AppException('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    res.status(200).json(result);
  }

  /**
   * Get users around a specific user rank (for showing context in UI)
   * Params:
   * - userId: string (user ID)
   * Query params:
   * - contextSize: number (default: 5, how many users before/after)
   */
  async getUserRankContext(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { userId } = req.params;
    const contextSize = Math.min(50, Math.max(1, parseInt(req.query.contextSize as string) || 5));

    if (!userId) {
      throw new AppException('User ID is required', 400, 'MISSING_USER_ID');
    }

    const result = await this.leaderboardService.getUserRankContext(userId as string, contextSize);

    if (!result || result.length === 0) {
      throw new AppException(
        'User not found or no rank context available',
        404,
        'CONTEXT_NOT_FOUND'
      );
    }

    res.status(200).json(result);
  }

  /**
   * Get leaderboard statistics
   */
  async getLeaderboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    const result = await this.leaderboardService.getLeaderboardStats();

    res.status(200).json(result);
  }
}
