import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringBypassCodeEntity,
  ExamProctoringBypassCodeInsert,
  examProctoringBypassCodes,
} from '@backend/shared/db/schema';

export class ProctoringBypassRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringBypassCodeInsert): Promise<ExamProctoringBypassCodeEntity> {
    const [created] = await this.database
      .insert(examProctoringBypassCodes)
      .values(values)
      .returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringBypassCodeEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringBypassCodes)
      .where(eq(examProctoringBypassCodes.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringBypassCodeEntity[]> {
    return this.database
      .select()
      .from(examProctoringBypassCodes)
      .where(eq(examProctoringBypassCodes.participationId, participationId))
      .orderBy(desc(examProctoringBypassCodes.createdAt));
  }

  async findIssuedForVerification(input: {
    examId: string;
    entrySessionId?: string | null;
    participationId?: string | null;
    clientSessionId: string;
    now?: Date;
  }): Promise<ExamProctoringBypassCodeEntity | null> {
    const now = input.now ?? new Date();
    const [row] = await this.database
      .select()
      .from(examProctoringBypassCodes)
      .where(
        and(
          eq(examProctoringBypassCodes.examId, input.examId),
          input.entrySessionId
            ? eq(examProctoringBypassCodes.entrySessionId, input.entrySessionId)
            : isNull(examProctoringBypassCodes.entrySessionId),
          input.participationId
            ? eq(examProctoringBypassCodes.participationId, input.participationId)
            : isNull(examProctoringBypassCodes.participationId),
          eq(examProctoringBypassCodes.clientSessionId, input.clientSessionId),
          eq(examProctoringBypassCodes.status, 'issued'),
          gt(examProctoringBypassCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(examProctoringBypassCodes.createdAt))
      .limit(1);
    return row ?? null;
  }

  async findUsedGrant(input: {
    id: string;
    examId: string;
    candidateUserId: string;
    entrySessionId?: string | null;
    participationId?: string | null;
    now?: Date;
  }): Promise<ExamProctoringBypassCodeEntity | null> {
    const now = input.now ?? new Date();
    const [row] = await this.database
      .select()
      .from(examProctoringBypassCodes)
      .where(
        and(
          eq(examProctoringBypassCodes.id, input.id),
          eq(examProctoringBypassCodes.examId, input.examId),
          eq(examProctoringBypassCodes.usedByUserId, input.candidateUserId),
          eq(examProctoringBypassCodes.status, 'used'),
          gt(examProctoringBypassCodes.expiresAt, now),
          input.entrySessionId
            ? eq(examProctoringBypassCodes.entrySessionId, input.entrySessionId)
            : isNull(examProctoringBypassCodes.entrySessionId),
          input.participationId
            ? eq(examProctoringBypassCodes.participationId, input.participationId)
            : isNull(examProctoringBypassCodes.participationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async markUsed(
    id: string,
    input: { usedByUserId: string; usedAt: Date },
  ): Promise<ExamProctoringBypassCodeEntity | null> {
    const [row] = await this.database
      .update(examProctoringBypassCodes)
      .set({
        status: 'used',
        usedByUserId: input.usedByUserId,
        usedAt: input.usedAt,
      })
      .where(and(eq(examProctoringBypassCodes.id, id), eq(examProctoringBypassCodes.status, 'issued')))
      .returning();
    return row ?? null;
  }

  async incrementFailedAttempts(id: string): Promise<void> {
    await this.database
      .update(examProctoringBypassCodes)
      .set({ failedAttempts: sql`${examProctoringBypassCodes.failedAttempts} + 1` })
      .where(eq(examProctoringBypassCodes.id, id));
  }
}
