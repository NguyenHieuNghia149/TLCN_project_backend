import { TestcaseEntity, TestcaseInsert, testcases } from '@/database/schema';
import { and, eq } from 'drizzle-orm';
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
}
