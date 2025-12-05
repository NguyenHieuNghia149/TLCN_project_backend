import { Request, Response, NextFunction } from 'express';
import { LeaderboardService } from '@/services/leaderboard.service';
import { BaseException, ErrorHandler } from '@/exceptions/auth.exceptions';

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
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const search = (req.query.search as string) || undefined;

      const result = await this.leaderboardService.getLeaderboard(page, limit, search);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get top users
   * Query params:
   * - limit: number (default: 10, max: 100)
   */
  async getTopUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

      const result = await this.leaderboardService.getTopUsers(limit);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's rank information
   * Params:
   * - userId: string (user ID)
   */
  async getUserRank(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const result = await this.leaderboardService.getUserRank(userId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'User not found or inactive',
        });
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get users around a specific user rank (for showing context in UI)
   * Params:
   * - userId: string (user ID)
   * Query params:
   * - contextSize: number (default: 5, how many users before/after)
   */
  async getUserRankContext(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { userId } = req.params;
      const contextSize = Math.min(50, Math.max(1, parseInt(req.query.contextSize as string) || 5));

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const result = await this.leaderboardService.getUserRankContext(userId, contextSize);

      if (!result || result.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found or no rank context available',
        });
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get leaderboard statistics
   */
  async getLeaderboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.leaderboardService.getLeaderboardStats();

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Error handler
   */
  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    const errorResponse = ErrorHandler.getErrorResponse(error);
    return res.status(errorResponse.statusCode).json({
      success: false,
      message: errorResponse.message,
      code: errorResponse.code,
    });
  }
}
