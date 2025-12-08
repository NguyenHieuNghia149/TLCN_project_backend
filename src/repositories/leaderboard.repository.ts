import { eq, desc, count, sql, and, ilike, or } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { users, submissions, UserEntity } from '@/database/schema';

export interface LeaderboardEntry {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  rankingPoint: number;
  submissionCount: number;
  rank: number;
}

export interface LeaderboardFilters {
  limit?: number;
  offset?: number;
  searchQuery?: string;
}

export class LeaderboardRepository extends BaseRepository<typeof users, UserEntity, any> {
  constructor() {
    super(users);
  }

  /**
   * Get leaderboard ranking based on ranking points and submission count
   * Criteria:
   * 1. Primary: ranking_point (descending)
   * 2. Secondary: number of submissions (ascending - fewer submissions rank higher)
   * 3. Tertiary: createdAt (ascending - earlier users rank higher if tied)
   */
  async getLeaderboard(filters: LeaderboardFilters = {}): Promise<LeaderboardEntry[]> {
    const { limit = 100, offset = 0, searchQuery } = filters;

    // Build where conditions
    const conditions = [eq(users.status, 'active')];

    if (searchQuery) {
      const searchPattern = `%${searchQuery.toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${users.firstName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.lastName}) LIKE LOWER(${searchPattern})`,
          sql`LOWER(${users.email}) LIKE LOWER(${searchPattern})`
        )!
      );
    }

    // Get users with submission counts using raw SQL
    const results = await this.db.execute(
      sql`
        SELECT 
          u.id,
          u.email,
          u.first_name as "firstName",
          u.last_name as "lastName",
          u.avatar,
          u.ranking_point as "rankingPoint",
          COALESCE(COUNT(s.id), 0) as "submissionCount",
          ROW_NUMBER() OVER (ORDER BY u.ranking_point DESC, COALESCE(COUNT(s.id), 0) ASC, u.created_at ASC) as rank
        FROM users u
        LEFT JOIN submissions s ON u.id = s.user_id
        WHERE u.status = 'active'
        ${
          searchQuery
            ? sql`AND (
              LOWER(u.first_name) LIKE LOWER(${`%${searchQuery}%`}) OR
              LOWER(u.last_name) LIKE LOWER(${`%${searchQuery}%`}) OR
              LOWER(u.email) LIKE LOWER(${`%${searchQuery}%`})
            )`
            : sql``
        }
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.avatar, u.ranking_point, u.created_at
        ORDER BY u.ranking_point DESC, "submissionCount" ASC, u.created_at ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    );

    return results.rows as unknown as LeaderboardEntry[];
  }

  /**
   * Get total leaderboard count (for pagination)
   */
  async getLeaderboardTotal(searchQuery?: string): Promise<number> {
    const result = await this.db.execute(
      sql`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        WHERE u.status = 'active'
        ${
          searchQuery
            ? sql`AND (
              LOWER(u.first_name) LIKE LOWER(${`%${searchQuery}%`}) OR
              LOWER(u.last_name) LIKE LOWER(${`%${searchQuery}%`}) OR
              LOWER(u.email) LIKE LOWER(${`%${searchQuery}%`})
            )`
            : sql``
        }
      `
    );

    return (result.rows[0]?.count as number) || 0;
  }

  /**
   * Get user rank by their ID
   */
  async getUserRank(userId: string): Promise<LeaderboardEntry | null> {
    const result = await this.db.execute(
      sql`
        WITH leaderboard_data AS (
          SELECT 
            u.id,
            u.email,
            u.first_name as "firstName",
            u.last_name as "lastName",
            u.avatar,
            u.ranking_point as "rankingPoint",
            COALESCE(COUNT(s.id), 0) as "submissionCount",
            ROW_NUMBER() OVER (ORDER BY u.ranking_point DESC, COALESCE(COUNT(s.id), 0) ASC, u.created_at ASC) as rank
          FROM users u
          LEFT JOIN submissions s ON u.id = s.user_id
          WHERE u.status = 'active'
          GROUP BY u.id, u.email, u.first_name, u.last_name, u.avatar, u.ranking_point, u.created_at
        )
        SELECT * FROM leaderboard_data WHERE id = ${userId}
      `
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as LeaderboardEntry;
  }

  /**
   * Get top N users (for top 10, top 100, etc.)
   */
  async getTopUsers(limit: number = 10): Promise<LeaderboardEntry[]> {
    return await this.getLeaderboard({ limit });
  }

  /**
   * Get users around a specific user rank (for context)
   */
  async getUserRankContext(userId: string, contextSize: number = 5): Promise<LeaderboardEntry[]> {
    const userRank = await this.getUserRank(userId);
    if (!userRank) {
      return [];
    }

    const offset = Math.max(0, userRank.rank - contextSize - 1);
    return await this.getLeaderboard({ limit: contextSize * 2 + 1, offset });
  }

  /**
   * Update user ranking points
   */
  async updateUserRankingPoints(userId: string, points: number): Promise<void> {
    await this.db
      .update(users)
      .set({
        rankingPoint: points,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Increment user ranking points
   */
  async incrementUserRankingPoints(userId: string, points: number): Promise<void> {
    await this.db.execute(
      sql`
        UPDATE users 
        SET ranking_point = ranking_point + ${points},
            updated_at = NOW()
        WHERE id = ${userId}
      `
    );
  }
}
