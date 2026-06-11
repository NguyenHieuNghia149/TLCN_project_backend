import { eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringSummaryEntity,
  ExamProctoringSummaryInsert,
  examProctoringSummaries,
} from '@backend/shared/db/schema';

export class ProctoringSummaryRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringSummaryInsert): Promise<ExamProctoringSummaryEntity> {
    const [created] = await this.database.insert(examProctoringSummaries).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringSummaryEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringSummaries)
      .where(eq(examProctoringSummaries.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringSummaryEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringSummaries)
      .where(eq(examProctoringSummaries.participationId, participationId))
      .limit(1);
    return row ?? null;
  }

  async upsertForParticipation(
    values: ExamProctoringSummaryInsert,
  ): Promise<ExamProctoringSummaryEntity> {
    const [row] = await this.database
      .insert(examProctoringSummaries)
      .values(values)
      .onConflictDoUpdate({
        target: examProctoringSummaries.participationId,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}
