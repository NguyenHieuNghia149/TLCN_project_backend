import { LeaderboardRepository, LeaderboardEntry, LeaderboardFilters } from '@/repositories/leaderboard.repository';

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface UserRankResponse extends LeaderboardEntry {
  percentile: number; // User's percentile rank (0-100)
}

export class LeaderboardService {
  constructor(private readonly leaderboardRepository: LeaderboardRepository) {}

  /**
   * Get paginated leaderboard
   */
  async getLeaderboard(
    page: number = 1,
    limit: number = 20,
    searchQuery?: string
  ): Promise<LeaderboardResponse> {
    // Validate pagination parameters
    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 20;

    const offset = (page - 1) * limit;

    // Get leaderboard entries
    const entries = await this.leaderboardRepository.getLeaderboard({
      limit,
      offset,
      searchQuery,
    });

    // Get total count
    const total = await this.leaderboardRepository.getLeaderboardTotal(searchQuery);

    const totalPages = Math.ceil(total / limit);

    return {
      entries,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
    };
  }

  /**
   * Get top users
   */
  async getTopUsers(limit: number = 10): Promise<LeaderboardEntry[]> {
    if (limit < 1 || limit > 100) limit = 10;
    return await this.leaderboardRepository.getTopUsers(limit);
  }

  /**
   * Get user's rank information
   */
  async getUserRank(userId: string): Promise<UserRankResponse | null> {
    const userRank = await this.leaderboardRepository.getUserRank(userId);
    if (!userRank) {
      return null;
    }

    // Get total users to calculate percentile
    const total = await this.leaderboardRepository.getLeaderboardTotal();

    // Calculate percentile (0-100)
    const percentile = Math.round(((total - userRank.rank + 1) / total) * 100);

    return {
      ...userRank,
      percentile: Math.max(0, Math.min(100, percentile)),
    };
  }

  /**
   * Get users around a specific user rank (for showing context)
   */
  async getUserRankContext(userId: string, contextSize: number = 5): Promise<LeaderboardEntry[]> {
    if (contextSize < 1 || contextSize > 50) contextSize = 5;
    return await this.leaderboardRepository.getUserRankContext(userId, contextSize);
  }

  /**
   * Award ranking points to user (called when submission is accepted)
   */
  async awardRankingPoints(userId: string, points: number): Promise<void> {
    if (points < 0) {
      throw new Error('Ranking points must be non-negative');
    }
    await this.leaderboardRepository.incrementUserRankingPoints(userId, points);
  }

  /**
   * Get leaderboard statistics
   */
  async getLeaderboardStats(): Promise<{
    totalUsers: number;
    topUser: LeaderboardEntry | null;
    avgRankingPoints: number;
  }> {
    const topUser = (await this.leaderboardRepository.getTopUsers(1))[0] || null;
    const total = await this.leaderboardRepository.getLeaderboardTotal();

    // Calculate average ranking points (simplified - would need aggregation query in production)
    let avgRankingPoints = 0;
    if (topUser && total > 0) {
      avgRankingPoints = Math.floor(topUser.rankingPoint / 2); // Rough estimate
    }

    return {
      totalUsers: total,
      topUser,
      avgRankingPoints,
    };
  }
}
