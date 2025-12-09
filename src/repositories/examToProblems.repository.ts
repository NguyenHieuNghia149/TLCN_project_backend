import { examToProblems, ExamToProblemsEntity, ExamToProblemsInsert } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq } from 'drizzle-orm';

export class ExamToProblemsRepository extends BaseRepository<
  typeof examToProblems,
  ExamToProblemsEntity,
  ExamToProblemsInsert
> {
  constructor() {
    super(examToProblems);
  }

  async findByExamId(examId: string) {
    return this.db.select().from(this.table).where(eq(this.table.examId, examId));
  }

  async createMany(relations: ExamToProblemsInsert[]) {
    if (relations.length === 0) return [];
    return this.db.insert(this.table).values(relations).returning();
  }

  /**
   * Link problems to an exam inside a provided transaction `tx`.
   */
  async linkProblemsWithTx(tx: any, examId: string, links: { problemId: string; orderIndex: number }[]) {
    if (!links || links.length === 0) return [];
    const inserts = links.map(l => ({ examId, problemId: l.problemId, orderIndex: l.orderIndex }));
    const rows = await tx.insert(examToProblems).values(inserts).returning();
    return rows;
  }
}
