import { users, UserEntity, UserInsert } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq, ilike, and, or, desc, asc, gte, lte, count } from 'drizzle-orm';
import { UserAlreadyExistsException, UserNotFoundException } from '@/exceptions/auth.exceptions';
import { SanitizationUtils } from '@/utils/security';

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

export interface UserWithStats extends UserEntity {
  postsCount: number;
  lastPostDate: Date | null;
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
    };

    const [user] = await this.db
      .update(users)
      .set({ ...sanitizedData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      throw new UserNotFoundException(`User with id ${id} not found`);
    }

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
}
