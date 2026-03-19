import { TestcaseEntity, TestcaseInsert, testcases } from '@backend/shared/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { FunctionSignature } from '@backend/shared/types';
import { buildFunctionInputDisplayValue, canonicalizeStructuredValue } from '@backend/shared/utils';

export class TestcaseRepository extends BaseRepository<
  typeof testcases,
  TestcaseEntity,
  TestcaseInsert
> {
  constructor() {
    super(testcases);
  }

  async findByProblemId(problemId: string, executor?: any): Promise<TestcaseEntity[]> {
    const result = await (executor ?? this.db)
      .select()
      .from(this.table)
      .where(eq(this.table.problemId, problemId));

    return result;
  }

  async findByProblemIds(problemIds: string[]): Promise<TestcaseEntity[]> {
    if (problemIds.length === 0) {
      return [];
    }

    return this.db.select().from(this.table).where(inArray(this.table.problemId, problemIds));
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

  async sumPointsByProblemIds(
    problemIds: string[],
    executor?: any
  ): Promise<Record<string, number>> {
    const rows = await (executor ?? this.db)
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

  private normalizeTestcaseRecord(problemId: string, testcase: any, functionSignature: FunctionSignature) {
    return {
      problemId,
      input: buildFunctionInputDisplayValue(
        functionSignature,
        testcase.inputJson as Record<string, unknown>
      ),
      output: canonicalizeStructuredValue(testcase.outputJson),
      inputJson: testcase.inputJson ?? null,
      outputJson: testcase.outputJson ?? null,
      isPublic: testcase.isPublic ?? false,
      point: testcase.point ?? 0,
    };
  }

  async updateTestcasesTransactional(
    problemId: string,
    testcasesData: any[],
    functionSignature: FunctionSignature
  ): Promise<void> {
    await this.db.transaction(async (tx: any) => {
      await tx.delete(this.table).where(eq(this.table.problemId, problemId));

      if (testcasesData && testcasesData.length > 0) {
        await tx.insert(this.table).values(
          testcasesData.map(testcase =>
            this.normalizeTestcaseRecord(problemId, testcase, functionSignature)
          ) as any
        );
      }
    });
  }
}
