import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringFinalFlushReceiptEntity,
  ExamProctoringFinalFlushReceiptInsert,
  examProctoringFinalFlushReceipts,
} from '@backend/shared/db/schema';

export type ProctoringFinalFlushStatus =
  | 'received'
  | 'persisting'
  | 'persisted'
  | 'failed'
  | 'timeout';

export class ProctoringFinalFlushRepository {
  constructor(private readonly database: any = db) {}

  async insert(
    values: ExamProctoringFinalFlushReceiptInsert,
  ): Promise<ExamProctoringFinalFlushReceiptEntity> {
    const [created] = await this.database
      .insert(examProctoringFinalFlushReceipts)
      .values(values)
      .returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringFinalFlushReceiptEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringFinalFlushReceipts)
      .where(eq(examProctoringFinalFlushReceipts.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringFinalFlushReceiptEntity[]> {
    return this.database
      .select()
      .from(examProctoringFinalFlushReceipts)
      .where(eq(examProctoringFinalFlushReceipts.participationId, participationId));
  }

  async findByParticipationAndSubmitAttempt(input: {
    participationId: string;
    submitAttemptId: string;
  }): Promise<ExamProctoringFinalFlushReceiptEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringFinalFlushReceipts)
      .where(
        and(
          eq(examProctoringFinalFlushReceipts.participationId, input.participationId),
          eq(examProctoringFinalFlushReceipts.submitAttemptId, input.submitAttemptId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async upsertReceipt(
    values: ExamProctoringFinalFlushReceiptInsert,
  ): Promise<ExamProctoringFinalFlushReceiptEntity> {
    const [row] = await this.database
      .insert(examProctoringFinalFlushReceipts)
      .values(values)
      .onConflictDoUpdate({
        target: [
          examProctoringFinalFlushReceipts.participationId,
          examProctoringFinalFlushReceipts.submitAttemptId,
        ],
        set: {
          status: values.status,
          expectedEventCount: values.expectedEventCount ?? 0,
          acceptedCount: values.acceptedCount ?? 0,
          firstClientSeq: values.firstClientSeq ?? null,
          lastClientSeq: values.lastClientSeq ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async transitionStatus(input: {
    receiptId: string;
    fromStatuses: ProctoringFinalFlushStatus[];
    toStatus: ProctoringFinalFlushStatus;
    persistedAt?: Date | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    counts?: {
      acceptedCount?: number;
      dedupedCount?: number;
      persistedCount?: number;
    };
  }): Promise<ExamProctoringFinalFlushReceiptEntity | null> {
    const [row] = await this.database
      .update(examProctoringFinalFlushReceipts)
      .set({
        status: input.toStatus,
        acceptedCount: input.counts?.acceptedCount,
        dedupedCount: input.counts?.dedupedCount,
        persistedCount: input.counts?.persistedCount,
        persistedAt: input.persistedAt ?? undefined,
        errorCode: input.errorCode ?? undefined,
        errorMessage: input.errorMessage ?? undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(examProctoringFinalFlushReceipts.id, input.receiptId),
          inArray(examProctoringFinalFlushReceipts.status, input.fromStatuses),
        ),
      )
      .returning();
    return row ?? null;
  }
}
