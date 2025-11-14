import {
  FavoriteEntity,
  FavoriteInsert,
  favorite,
  ProblemEntity,
  problems,
} from '@/database/schema';
import { BaseRepository } from './base.repository';
import { and, desc, eq, inArray } from 'drizzle-orm';

export type FavoriteWithProblem = {
  favorite: FavoriteEntity;
  problem: ProblemEntity | null;
};

export class FavoriteRepository extends BaseRepository<
  typeof favorite,
  FavoriteEntity,
  FavoriteInsert
> {
  constructor() {
    super(favorite);
  }

  async findByUserAndProblem(userId: string, problemId: string): Promise<FavoriteEntity | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.problemId, problemId)))
      .limit(1);

    return rows[0] ?? null;
  }

  async addFavorite(userId: string, problemId: string): Promise<FavoriteEntity> {
    // Check if already exists first to avoid unnecessary insert
    const existing = await this.findByUserAndProblem(userId, problemId);
    if (existing) {
      return existing;
    }

    try {
      const [inserted] = await this.db
        .insert(this.table)
        .values({
          userId,
          problemId,
        } as FavoriteInsert)
        .returning();

      if (inserted) {
        return inserted;
      }

      // If insert returned nothing, check again (race condition)
      const recheck = await this.findByUserAndProblem(userId, problemId);
      if (recheck) {
        return recheck;
      }

      throw new Error('Failed to create favorite');
    } catch (error: any) {
      // If unique constraint violation, check if it exists now
      if (error.code === '23505' || error.message?.includes('unique')) {
        const recheck = await this.findByUserAndProblem(userId, problemId);
        if (recheck) {
          return recheck;
        }
      }
      throw error;
    }
  }

  async removeFavorite(userId: string, problemId: string): Promise<boolean> {
    const result = await this.db
      .delete(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.problemId, problemId)));

    return (result.rowCount ?? 0) > 0;
  }

  async listFavoritesByUser(userId: string): Promise<FavoriteWithProblem[]> {
    const rows = await this.db
      .select({
        favorite: this.table,
        problem: problems,
      })
      .from(this.table)
      .leftJoin(problems, eq(this.table.problemId, problems.id))
      .where(eq(this.table.userId, userId))
      .orderBy(desc(this.table.createdAt));

    return rows as FavoriteWithProblem[];
  }

  async getFavoriteProblemIds(userId: string, problemIds: string[]): Promise<Set<string>> {
    if (problemIds.length === 0) {
      return new Set();
    }

    const rows = await this.db
      .select({ problemId: this.table.problemId })
      .from(this.table)
      .where(and(eq(this.table.userId, userId), inArray(this.table.problemId, problemIds)));

    return new Set(rows.map(row => row.problemId).filter(Boolean) as string[]);
  }

  async isFavorite(userId: string, problemId: string): Promise<boolean> {
    const favoriteRecord = await this.findByUserAndProblem(userId, problemId);
    return Boolean(favoriteRecord);
  }
}
