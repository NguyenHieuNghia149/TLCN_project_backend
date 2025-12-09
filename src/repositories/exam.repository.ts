import { exam, ExamEntity, ExamInsert, problems, examToProblems } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { desc, eq, count, and, inArray, sql } from 'drizzle-orm';

export class ExamRepository extends BaseRepository<typeof exam, ExamEntity, ExamInsert> {
  constructor() {
    super(exam);
  }

  getAllExams(): Promise<ExamEntity[]> {
    return this.db
      .select()
      .from(exam)
      .where(eq(exam.isVisible, true))
      .orderBy(desc(exam.createdAt));
  }

  async getExamsPaginated(
    limit = 50,
    offset = 0,
    options?: { search?: string; createdBy?: string; examIds?: string[] }
  ): Promise<{ items: ExamEntity[]; total: number }> {
    const predicates: any[] = [eq(exam.isVisible, true)];

    // Note: createdBy filter not supported because `exam` table does not include creator column

    if (options?.examIds && options.examIds.length > 0) {
      predicates.push(inArray(exam.id, options.examIds));
    }

    if (options?.search) {
      // case-insensitive search on title
      const pattern = `%${options.search.toLowerCase()}%`;
      predicates.push(sql`LOWER(${exam.title}) LIKE ${pattern}`);
    }

    const items = await this.db
      .select()
      .from(exam)
      .where(and(...predicates))
      .orderBy(desc(exam.createdAt))
      .limit(limit)
      .offset(offset);

    const totalRes = await this.db
      .select({ total: count() })
      .from(exam)
      .where(and(...predicates));
    const total = Number((totalRes && totalRes[0] && (totalRes[0] as any).total) || 0);

    return { items: items as ExamEntity[], total };
  }

  /**
   * Create an exam along with linking challenges. The entire operation is executed
   * inside a single transaction so callers don't need to manage `tx`.
   * - `examFields` corresponds to the columns for `exam` table
   * - `challenges` is an array where each item is either `{ type: 'existing', challengeId, orderIndex }`
   *   or `{ type: 'new', challenge: ProblemInput, orderIndex }`.
   */
  async createExamWithChallenges(examFields: ExamInsert, challenges: any[]): Promise<string> {
    return this.db.transaction(async tx => {
      // Create exam row
      const createdExam = await this.createExamWithTx(tx, examFields);

      const challengeIds: string[] = [];
      const orderMap = new Map<string, number>();

      for (let i = 0; i < (challenges || []).length; i++) {
        const ch = challenges[i];
        if (!ch) continue;
        const orderIndex = ch.orderIndex ?? i;

        if (ch.type === 'existing') {
          // verify existence via tx to keep atomicity
          const rows = await tx
            .select()
            .from(problems)
            .where(inArray(problems.id, [ch.challengeId]));
          if (!rows || rows.length === 0) {
            throw new Error(`Challenge with ID ${ch.challengeId} not found`);
          }
          challengeIds.push(ch.challengeId);
          orderMap.set(ch.challengeId, orderIndex);
        } else if (ch.type === 'new') {
          // create problem inside the same tx using ProblemRepository's tx-aware method
          const { ProblemRepository } = await import('@/repositories/problem.repository');
          const probRepo = new ProblemRepository();
          // Use the repository's transactional API which accepts an optional tx
          // so we reuse the active transaction rather than calling a separate tx helper.
          const res = await probRepo.createProblemTransactional(ch.challenge, tx);
          challengeIds.push(res.problem.id);
          orderMap.set(res.problem.id, orderIndex);
        }
      }

      // Link problems to exam
      const inserts = challengeIds.map(pid => ({
        examId: createdExam.id,
        problemId: pid,
        orderIndex: orderMap.get(pid) ?? 0,
      }));
      if (inserts.length > 0) {
        await tx.insert(examToProblems).values(inserts).returning();
      }

      return createdExam.id;
    });
  }

  /**
   * Create an exam using a provided transaction client `tx` so callers can compose
   * larger transactions that include exam creation.
   */
  async createExamWithTx(tx: any, input: ExamInsert): Promise<ExamEntity> {
    const rows = await tx.insert(exam).values(input).returning();
    const created = rows && rows[0];
    if (!created) throw new Error('Failed to create exam');
    return created as ExamEntity;
  }
}
