import { SolutionEntity, SolutionInsert, solutions } from '@/database/schema';
import { and, eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';

export class SolutionRepository extends BaseRepository<
  typeof solutions,
  SolutionEntity,
  SolutionInsert
> {
  constructor() {
    super(solutions);
  }

  async updateVisibility(id: string, isVisible: boolean): Promise<SolutionEntity | null> {
    const [result] = await this.db
      .update(this.table)
      .set({ isVisible, updatedAt: new Date() })
      .where(eq(this.table.id, id))
      .returning();

    return result || null;
  }

  async findByProblemId(problemId: string, isVisible?: boolean): Promise<SolutionEntity | null> {
    const whereCondition =
      isVisible !== undefined
        ? and(eq(this.table.problemId, problemId), eq(this.table.isVisible, isVisible))
        : eq(this.table.problemId, problemId);

    const [result] = await this.db.select().from(this.table).where(whereCondition).limit(1);

    return result || null;
  }

  async deleteByProblemId(problemId: string): Promise<boolean> {
    const [result] = await this.db
      .delete(this.table)
      .where(eq(this.table.problemId, problemId))
      .returning();

    return !!result;
  }
}
