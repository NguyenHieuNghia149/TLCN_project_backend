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

  /**
   * Update testcases transactionally: delete all existing and insert new ones.
   */
  async updateTestcasesTransactional(problemId: string, testcasesData: any[]): Promise<void> {
    await this.db.transaction(async tx => {
      // 1. Delete all existing testcases for this problem
      await tx.delete(this.table).where(eq(this.table.problemId, problemId));

      // 2. Insert new testcases
      if (testcasesData && testcasesData.length > 0) {
        await Promise.all(
          testcasesData.map(tc =>
            tx.insert(this.table).values({
              problemId: problemId,
              input: tc.input,
              output: tc.output,
              isPublic: tc.isPublic ?? false,
              point: tc.point ?? 0,
            } as any)
          )
        );
      }
    });
  }
}
