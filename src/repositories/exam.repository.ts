import { exam, ExamEntity, ExamInsert } from '@/database/schema';
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
}
