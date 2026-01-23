import { SQL, eq, desc, asc, count, and } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/database/connection';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
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

export abstract class BaseRepository<TTable extends PgTable, TSelect, TInsert> {
  protected db = db;

  constructor(protected readonly table: TTable) {}

  async findById(id: string): Promise<TSelect | null> {
    const result = await this.db
      .select()
      .from(this.table as any)
      .where(eq((this.table as any).id, id))
      .limit(1);

    return (result[0] as any) || null;
  }

  async findMany(paginationOptions: PaginationOptions = {}): Promise<PaginationResult<TSelect>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = paginationOptions;

    // Validate values
    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query data
    const query = this.db.select().from(this.table as any);
    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortOrder === 'asc' ? asc((this.table as any)[sortBy]) : desc((this.table as any)[sortBy])
      );

    // Count total records
    const queryTotal = await this.db.select({ total: count() }).from(this.table as any);
    const total = queryTotal[0]?.total || 0;
    // Execute query to retrieve data
    const data = await dataQuery;

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data: data as TSelect[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async findManyLazy(
    paginationOptions: PaginationOptions = {}
  ): Promise<PaginationResult<TSelect>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = paginationOptions;

    if (page < 1 || limit < 1) {
      throw new Error('Page and limit must be positive numbers');
    }

    const offset = (page - 1) * limit;

    // Query data
    const query = this.db.select().from(this.table as any);
    const dataQuery = query
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortOrder === 'asc' ? asc((this.table as any)[sortBy]) : desc((this.table as any)[sortBy])
      );

    // Count total records
    const queryTotal = await this.db.select({ total: count() }).from(this.table as any);

    const total = queryTotal[0]?.total || 0;
    // Execute query to retrieve data
    const data = await dataQuery;

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data: data as TSelect[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(this.table).where(eq((this.table as any).id, id));

    return (result.rowCount as any) > 0;
  }

  async exists(where: SQL): Promise<boolean> {
    const result = await this.db
      .select({ exists: count() })
      .from(this.table as any)
      .where(where);
    return (result as any) > 0;
  }

  async update(id: string, data: Partial<TInsert>): Promise<TSelect | null> {
    // Filter out undefined values but keep null values (for explicitly setting to null)
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    const [result] = await this.db
      .update(this.table as any)
      .set({ ...cleanData, updatedAt: new Date() } as any)
      .where(eq((this.table as any).id, id))
      .returning();

    return (result as any) || null;
  }

  async create(data: TInsert): Promise<TSelect> {
    const [result] = await this.db
      .insert(this.table)
      .values(data as any)
      .returning();
    return result as any;
  }
}
