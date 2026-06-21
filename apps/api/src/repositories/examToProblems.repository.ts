import {
  examToProblems,
  ExamToProblemsEntity,
  ExamToProblemsInsert,
  problems,
  topics,
} from '@backend/shared/db/schema';
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

  async findDetailedByExamId(examId: string) {
    return this.db
      .select({
        examId: examToProblems.examId,
        problemId: examToProblems.problemId,
        orderIndex: examToProblems.orderIndex,
        title: problems.title,
        description: problems.description,
        difficulty: problems.difficult,
        visibility: problems.visibility,
        topicId: problems.topicId,
        topicName: topics.topicName,
        createdAt: problems.createdAt,
        updatedAt: problems.updatedAt,
      })
      .from(examToProblems)
      .innerJoin(problems, eq(examToProblems.problemId, problems.id))
      .leftJoin(topics, eq(problems.topicId, topics.id))
      .where(eq(examToProblems.examId, examId));
  }

  async createMany(relations: ExamToProblemsInsert[]) {
    if (relations.length === 0) return [];
    return this.db.insert(this.table).values(relations).returning();
  }

  /**
   * Link problems to an exam inside a provided transaction `tx`.
   */
  async linkProblemsWithTx(
    tx: any,
    examId: string,
    links: { problemId: string; orderIndex: number }[]
  ) {
    if (!links || links.length === 0) return [];
    const inserts = links.map(l => ({ examId, problemId: l.problemId, orderIndex: l.orderIndex }));
    const rows = await tx.insert(examToProblems).values(inserts).returning();
    return rows;
  }
}
