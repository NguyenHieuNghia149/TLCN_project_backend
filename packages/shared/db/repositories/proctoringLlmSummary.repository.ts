import { and, count, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';

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

  async countActiveRecentForParticipation(
    participationId: string,
    since: Date
  ): Promise<number> {
    const [result] = await this.database
      .select({ total: count() })
      .from(examProctoringLlmSummaries)
      .where(
        and(
          eq(examProctoringLlmSummaries.participationId, participationId),
          gte(examProctoringLlmSummaries.createdAt, since),
          inArray(examProctoringLlmSummaries.status, ['pending', 'accepted'])
        )
      );
    return result?.total ?? 0;
  }

  async findLatestByParticipation(
    participationId: string
  ): Promise<ExamProctoringLlmSummaryEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringLlmSummaries)
      .where(eq(examProctoringLlmSummaries.participationId, participationId))
      .orderBy(desc(examProctoringLlmSummaries.createdAt))
      .limit(1);
    return row ?? null;
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
