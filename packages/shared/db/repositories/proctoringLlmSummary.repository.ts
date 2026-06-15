import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../connection';
import {
  ExamProctoringLlmSummaryEntity,
  ExamProctoringLlmSummaryInsert,
  examProctoringLlmSummaries,
} from '../schema';

export class ProctoringLlmSummaryRepository {
  constructor(private readonly database: any = db) {}

  async insertOrFindActive(
    values: ExamProctoringLlmSummaryInsert
  ): Promise<{ row: ExamProctoringLlmSummaryEntity; conflictResolved: boolean }> {
    const [created] = await this.database
      .insert(examProctoringLlmSummaries)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (created) {
      return { row: created, conflictResolved: false };
    }

    const [existing] = await this.database
      .select()
      .from(examProctoringLlmSummaries)
      .where(
        and(
          eq(examProctoringLlmSummaries.participationId, values.participationId),
          eq(examProctoringLlmSummaries.inputHash, values.inputHash),
          eq(examProctoringLlmSummaries.promptVersion, values.promptVersion),
          eq(examProctoringLlmSummaries.modelVersion, values.modelVersion),
          inArray(examProctoringLlmSummaries.status, ['pending', 'accepted'])
        )
      )
      .orderBy(desc(examProctoringLlmSummaries.createdAt))
      .limit(1);
    if (!existing) {
      throw new Error('Failed to insert or find active LLM summary row.');
    }
    return { row: existing, conflictResolved: true };
  }

  async updateJobId(id: string, jobId: string): Promise<ExamProctoringLlmSummaryEntity | null> {
    const [row] = await this.database
      .update(examProctoringLlmSummaries)
      .set({ jobId, updatedAt: new Date() })
      .where(eq(examProctoringLlmSummaries.id, id))
      .returning();
    return row ?? null;
  }

  async updateStatus(
    id: string,
    patch: Partial<ExamProctoringLlmSummaryInsert>
  ): Promise<ExamProctoringLlmSummaryEntity | null> {
    const [row] = await this.database
      .update(examProctoringLlmSummaries)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(examProctoringLlmSummaries.id, id))
      .returning();
    return row ?? null;
  }
}
