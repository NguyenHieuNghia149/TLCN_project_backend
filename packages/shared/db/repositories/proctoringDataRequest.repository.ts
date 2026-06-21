import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '../connection';
import {
  ExamProctoringDataRequestEntity,
  ExamProctoringDataRequestInsert,
  examProctoringDataRequests,
} from '../schema';

export class ProctoringDataRequestRepository {
  constructor(private readonly database: any = db) {}

  async insert(
    values: ExamProctoringDataRequestInsert
  ): Promise<ExamProctoringDataRequestEntity> {
    const [row] = await this.database
      .insert(examProctoringDataRequests)
      .values(values)
      .returning();
    return row;
  }

  async findById(id: string): Promise<ExamProctoringDataRequestEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringDataRequests)
      .where(eq(examProctoringDataRequests.id, id));
    return row ?? null;
  }

  async findByExamId(
    examId: string,
    limit = 50,
    offset = 0
  ): Promise<ExamProctoringDataRequestEntity[]> {
    return this.database
      .select()
      .from(examProctoringDataRequests)
      .where(eq(examProctoringDataRequests.examId, examId))
      .orderBy(desc(examProctoringDataRequests.requestedAt))
      .limit(limit)
      .offset(offset);
  }

  async findByCandidateUserId(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<ExamProctoringDataRequestEntity[]> {
    return this.database
      .select()
      .from(examProctoringDataRequests)
      .where(eq(examProctoringDataRequests.candidateUserId, userId))
      .orderBy(desc(examProctoringDataRequests.requestedAt))
      .limit(limit)
      .offset(offset);
  }

  async findPendingExecution(
    limit = 5
  ): Promise<ExamProctoringDataRequestEntity[]> {
    return this.database
      .select()
      .from(examProctoringDataRequests)
      .where(
        and(
          eq(examProctoringDataRequests.status, 'validated'),
          isNull(examProctoringDataRequests.dryRunMode),
          inArray(examProctoringDataRequests.requestType, ['delete', 'anonymize'])
        )
      )
      .orderBy(asc(examProctoringDataRequests.internalTargetDueAt))
      .limit(limit);
  }

  async updateStatus(
    id: string,
    patch: Partial<ExamProctoringDataRequestInsert>
  ): Promise<ExamProctoringDataRequestEntity | null> {
    const [row] = await this.database
      .update(examProctoringDataRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(examProctoringDataRequests.id, id))
      .returning();
    return row ?? null;
  }
}
