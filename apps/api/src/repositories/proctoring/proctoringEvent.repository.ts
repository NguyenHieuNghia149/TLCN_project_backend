import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringEventEntity,
  ExamProctoringEventInsert,
  examProctoringEvents,
} from '@backend/shared/db/schema';

export type ProctoringBulkInsertResult = {
  inserted: ExamProctoringEventEntity[];
  insertedCount: number;
  dedupedCount: number;
};

export class ProctoringEventRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringEventInsert): Promise<ExamProctoringEventEntity> {
    const [created] = await this.database.insert(examProctoringEvents).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringEventEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringEvents)
      .where(eq(examProctoringEvents.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(
    participationId: string,
    range?: { from?: Date; to?: Date; limit?: number },
  ): Promise<ExamProctoringEventEntity[]> {
    const predicates = [eq(examProctoringEvents.participationId, participationId)];
    if (range?.from) {
      predicates.push(gte(examProctoringEvents.capturedAt, range.from));
    }
    if (range?.to) {
      predicates.push(lte(examProctoringEvents.capturedAt, range.to));
    }

    return this.database
      .select()
      .from(examProctoringEvents)
      .where(and(...predicates))
      .orderBy(desc(examProctoringEvents.capturedAt))
      .limit(range?.limit ?? 1000);
  }

  async bulkInsertDedupe(
    values: ExamProctoringEventInsert[],
  ): Promise<ProctoringBulkInsertResult> {
    if (values.length === 0) {
      return { inserted: [], insertedCount: 0, dedupedCount: 0 };
    }

    const inserted = await this.database
      .insert(examProctoringEvents)
      .values(values)
      .onConflictDoNothing({
        target: [
          examProctoringEvents.participationId,
          examProctoringEvents.clientSessionId,
          examProctoringEvents.clientSeq,
        ],
      })
      .returning();

    return {
      inserted,
      insertedCount: inserted.length,
      dedupedCount: values.length - inserted.length,
    };
  }
}
