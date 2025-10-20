import { TestcaseEntity, TestcaseInsert, testcases } from '@/database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';

export class TestcaseRepository extends BaseRepository<
  typeof testcases,
  TestcaseEntity,
  TestcaseInsert
> {
  constructor() {
    super(testcases);
  }

  async findByProblemId(problemId: string): Promise<TestcaseEntity[]> {
    const result = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.problemId, problemId));

    return result;
  }

  async findPublicByProblemId(problemId: string): Promise<TestcaseEntity[]> {
    const result = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.problemId, problemId), eq(this.table.isPublic, true)));

    return result;
  }

  async deleteByProblemId(problemId: string): Promise<boolean> {
    const [result] = await this.db
      .delete(this.table)
      .where(eq(this.table.problemId, problemId))
      .returning();

    return !!result;
  }

  async sumPointsByProblemIds(problemIds: string[]): Promise<Record<string, number>> {
    if (problemIds.length === 0) return {};

    const rows = await this.db
      .select({ problemId: this.table.problemId, total: sql<number>`SUM(${this.table.point})` })
      .from(this.table)
      .where(inArray(this.table.problemId, problemIds))
      .groupBy(this.table.problemId);

    const map: Record<string, number> = {};
    for (const row of rows as any[]) {
      map[row.problemId] = Number(row.total ?? 0);
    }
    return map;
  }
}
