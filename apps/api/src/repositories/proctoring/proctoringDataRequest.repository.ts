import { desc, eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringDataRequestEntity,
  ExamProctoringDataRequestInsert,
  examProctoringDataRequests,
} from '@backend/shared/db/schema';

export class ProctoringDataRequestRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringDataRequestInsert): Promise<ExamProctoringDataRequestEntity> {
    const [created] = await this.database
      .insert(examProctoringDataRequests)
      .values(values)
      .returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringDataRequestEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringDataRequests)
      .where(eq(examProctoringDataRequests.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringDataRequestEntity[]> {
    return this.database
      .select()
      .from(examProctoringDataRequests)
      .where(eq(examProctoringDataRequests.participationId, participationId))
      .orderBy(desc(examProctoringDataRequests.requestedAt));
  }

  async updateStatus(
    id: string,
    patch: Partial<ExamProctoringDataRequestInsert>,
  ): Promise<ExamProctoringDataRequestEntity | null> {
    const [row] = await this.database
      .update(examProctoringDataRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(examProctoringDataRequests.id, id))
      .returning();
    return row ?? null;
  }
}
