import { SanitizationUtils, logger } from '@backend/shared/utils';
import { users, UserEntity, UserInsert, submissions } from '@backend/shared/db/schema';
import { BaseRepository } from './base.repository';
import { eq, ilike, and, or, desc, asc, gte, lte, count, sql, gt } from 'drizzle-orm';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import {
  UserAlreadyExistsException,
  UserNotFoundException,
  ValidationException,
} from '../exceptions/auth.exceptions';

import { EUserRole } from '@backend/shared/types';

export interface UserFilters {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  status?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string; // Global search
}

export interface UserStatistics {
  totalSubmissions: number;
  acceptedSubmissions: number;
  wrongAnswerSubmissions: number;
  timeLimitExceededSubmissions: number;
  memoryLimitExceededSubmissions: number;
  runtimeErrorSubmissions: number;
  compilationErrorSubmissions: number;
  totalProblemsSolved: number;
  totalProblemsAttempted: number;
  acceptanceRate: number;
}

export interface UserWithStats extends UserEntity {
  postsCount: number;
  lastPostDate: Date | null;
  statistics?: UserStatistics;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class UserRepository extends BaseRepository<typeof users, UserEntity, UserInsert> {
  constructor() {
    super(users);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const sanitizedEmail = SanitizationUtils.sanitizeEmail(email);
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, sanitizedEmail))
      .limit(1);
    return user || null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user || null;
  }

  async findByEmailOrThrow(email: string): Promise<UserEntity> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new UserNotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async findByIdOrThrow(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new UserNotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async createUser(userData: UserInsert): Promise<UserEntity> {
    // Check if user already exists
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      throw new UserAlreadyExistsException(`User with email ${userData.email} already exists`);
    }

    // Sanitize input data
    const sanitizedData = {
      ...userData,
      email: SanitizationUtils.sanitizeEmail(userData.email),
      firstName: userData.firstName ? SanitizationUtils.sanitizeName(userData.firstName) : null,
      lastName: userData.lastName ? SanitizationUtils.sanitizeName(userData.lastName) : null,
    };

    const [user] = await this.db.insert(users).values(sanitizedData).returning();
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  async updateUser(id: string, userData: Partial<UserInsert>): Promise<UserEntity> {
    // Sanitize input data
    const sanitizedData = {
      ...userData,
      email: userData.email ? SanitizationUtils.sanitizeEmail(userData.email) : undefined,
      firstName: userData.firstName
        ? SanitizationUtils.sanitizeName(userData.firstName)
        : undefined,
      lastName: userData.lastName ? SanitizationUtils.sanitizeName(userData.lastName) : undefined,
      // Avatar URL from Cloudinary - do not sanitize
      avatar: userData.avatar,
    };

    const [user] = await this.db
      .update(users)
      .set({ ...sanitizedData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      throw new UserNotFoundException(`User with id ${id} not found`);
    }

    logger.info('User avatar updated to:', user.avatar);
    return user;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updateLoginAttempts(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async resetLoginAttempts(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        password: hashedPassword,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async verifyEmail(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async verifyPhone(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }

  async findUsersWithFilters(
    filters: UserFilters,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<UserEntity>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];

    if (filters.email) {
      conditions.push(eq(users.email, SanitizationUtils.sanitizeEmail(filters.email)));
    }

    if (filters.firstName) {
      conditions.push(ilike(users.firstName, `%${filters.firstName}%`));
    }

    if (filters.lastName) {
      conditions.push(ilike(users.lastName, `%${filters.lastName}%`));
    }

    if (filters.role) {
      conditions.push(eq(users.role, filters.role));
    }

    if (filters.status) {
      conditions.push(eq(users.status, filters.status));
    }

    if (filters.createdAfter) {
      conditions.push(gte(users.createdAt, filters.createdAfter));
    }

    if (filters.createdBefore) {
      conditions.push(lte(users.createdAt, filters.createdBefore));
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(users.firstName, `%${filters.search}%`),
          ilike(users.lastName, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [totalResult] = await this.db.select({ count: count() }).from(users).where(whereClause);

    const total = totalResult?.count || 0;

    // Get paginated data
    const data = await this.db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(sortOrder === 'desc' ? desc(users.createdAt) : asc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async deleteUser(id: string): Promise<void> {
    const result = await this.db.delete(users).where(eq(users.id, id));
    if (result.rowCount === 0) {
      throw new UserNotFoundException(`User with id ${id} not found`);
    }
  }

  async getUsersByRole(role: string): Promise<UserEntity[]> {
    return await this.db.select().from(users).where(eq(users.role, role));
  }

  async getActiveUsers(): Promise<UserEntity[]> {
    return await this.db.select().from(users).where(eq(users.status, 'active'));
  }

  async getUserStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    pending: number;
  }> {
    const [stats] = await this.db
      .select({
        total: count(),
        active: count(),
        inactive: count(),
        suspended: count(),
        pending: count(),
      })
      .from(users);

    if (!stats) {
      return {
        total: 0,
        active: 0,
        inactive: 0,
        suspended: 0,
        pending: 0,
      };
    }

    return stats;
  }

  async getUserStatistics(userId: string): Promise<UserStatistics> {
    // Get all submissions by status
    const allSubmissions = await this.db
      .select({
        status: submissions.status,
        problemId: submissions.problemId,
      })
      .from(submissions)
      .where(eq(submissions.userId, userId));

    // Count submissions by status
    const totalSubmissions = allSubmissions.length;

    const acceptedSubmissions = allSubmissions.filter((s: any) => s.status === 'accepted').length;
    const wrongAnswerSubmissions = allSubmissions.filter(
      (s: any) => s.status === 'wrong_answer'
    ).length;
    const timeLimitExceededSubmissions = allSubmissions.filter(
      (s: any) => s.status === 'time_limit_exceeded'
    ).length;
    const memoryLimitExceededSubmissions = allSubmissions.filter(
      (s: any) => s.status === 'memory_limit_exceeded'
    ).length;
    const runtimeErrorSubmissions = allSubmissions.filter(
      (s: any) => s.status === 'runtime_error'
    ).length;
    const compilationErrorSubmissions = allSubmissions.filter(
      (s: any) => s.status === 'compilation_error'
    ).length;

    // Get unique problems attempted
    const problemsAttempted = new Set(allSubmissions.map((s: any) => s.problemId));
    const totalProblemsAttempted = problemsAttempted.size;

    // Get problems solved (with at least one ACCEPTED submission)
    const problemsSolved = new Set(
      allSubmissions.filter((s: any) => s.status === 'accepted').map((s: any) => s.problemId)
    );
    const totalProblemsSolved = problemsSolved.size;

    // Calculate acceptance rate
    const acceptanceRate =
      totalSubmissions > 0 ? (acceptedSubmissions / totalSubmissions) * 100 : 0;

    return {
      totalSubmissions,
      acceptedSubmissions,
      wrongAnswerSubmissions,
      timeLimitExceededSubmissions,
      memoryLimitExceededSubmissions,
      runtimeErrorSubmissions,
      compilationErrorSubmissions,
      totalProblemsSolved,
      totalProblemsAttempted,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100, // Round to 2 decimal places
    };
  }

  async getUserSubmissionHistory(userId: string, limit: number = 10) {
    const result = await this.db
      .select()
      .from(submissions)
      .where(eq(submissions.userId, userId))
      .orderBy(sql`${submissions.submittedAt} DESC`)
      .limit(limit);

    return result;
  }

  async getUserSubmissionsByStatus(userId: string, status: string) {
    return await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.userId, userId), eq(submissions.status, status)));
  }
  async getUserRank(userId: string): Promise<{ rankingPoint: number; rank: number }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new UserNotFoundException(`User with id ${userId} not found`);
    }

    const currentPoint = user.rankingPoint ?? 0;

    const [higherCount] = await this.db
      .select({ cnt: count() })
      .from(users)
      .where(gt(users.rankingPoint, currentPoint));

    const rank = (higherCount?.cnt || 0) + 1;

    return { rankingPoint: currentPoint, rank };
  }

  async incrementRankingPoint(userId: string, point: number, executor?: any): Promise<UserEntity> {
    if (point < 0) {
      throw new ValidationException('Point cannot be negative');
    }

    const [user] = await (executor ?? this.db)
      .update(users)
      .set({
        rankingPoint: sql`${users.rankingPoint} + ${point}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new UserNotFoundException(`User with id ${userId} not found`);
    }

    return user;
  }

  async findAllIds(): Promise<string[]> {
    logger.info('[UserRepository] findAllIds called');
    logger.info('[UserRepository] EUserRole.USER value:', EUserRole.USER);
    const result = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.status, 'active'), eq(users.role, EUserRole.USER)));
    logger.info('[UserRepository] findAllIds result count:', result.length);
    return result.map((r: any) => r.id);
  }

  // --- Dashboard Methods ---

  async countTotal(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(users);
    return result[0]?.count || 0;
  }

  async countActive(days: number = 30): Promise<number> {
    const dateThreshold = subDays(new Date(), days);
    const result = await this.db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, dateThreshold));
    return result[0]?.count || 0;
  }

  async getGrowthStats(days: number = 7): Promise<Array<{ date: string; count: number }>> {
    const dateThreshold = startOfDay(subDays(new Date(), days - 1));

    const queryResult = await this.db.execute(sql`
      SELECT DATE(created_at) as date, COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${dateThreshold}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);

    // Create a map of date string to count
    const statsMap = new Map<string, number>();
    for (const row of queryResult.rows) {
      if (row.date) {
        // Handle Date object or string from DB
        const dateObj = typeof row.date === 'string' ? new Date(row.date) : row.date;
        const dateStr = (dateObj as Date).toISOString().substring(0, 10);
        statsMap.set(dateStr, Number(row.count) || 0);
      }
    }

    const userGrowth: Array<{ date: string; count: number }> = [];

    // Fill in all days (including zero count days)
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = date.toISOString().substring(0, 10);
      userGrowth.push({
        date: dateStr,
        count: statsMap.get(dateStr) || 0,
      });
    }

    return userGrowth;
  }

  async getRecent(limit: number = 3): Promise<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      createdAt: Date;
    }>
  > {
    return await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit);
  }
}
