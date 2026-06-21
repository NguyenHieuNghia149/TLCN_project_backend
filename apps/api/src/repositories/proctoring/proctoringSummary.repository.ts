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
    const [created] = await this.database
      .insert(examProctoringSummaries)
      .values(values)
      .returning();
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
    values: ExamProctoringSummaryInsert
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

  async upsertComputedForParticipation(
    values: ExamProctoringSummaryInsert,
    options: { preserveReviewerDecision?: boolean } = {}
  ): Promise<ExamProctoringSummaryEntity> {
    const preserveReviewerDecision = options.preserveReviewerDecision ?? true;
    const setValues: Record<string, unknown> = {
      examId: values.examId,
      sessionId: values.sessionId ?? null,
      riskScore: values.riskScore ?? 0,
      riskLevel: values.riskLevel ?? 'low',
      eventCountsJson: values.eventCountsJson ?? {},
      velocityJson: values.velocityJson ?? {},
      finalFlushStatus: values.finalFlushStatus ?? null,
      lastEventCapturedAt: values.lastEventCapturedAt ?? null,
      lastEventReceivedAt: values.lastEventReceivedAt ?? null,
      deterministicSchemaVersion: values.deterministicSchemaVersion,
      computedAt: values.computedAt,
      updatedAt: new Date(),
    };

    if (!preserveReviewerDecision && values.reviewerDecision) {
      setValues.reviewerDecision = values.reviewerDecision;
    }

    const [row] = await this.database
      .insert(examProctoringSummaries)
      .values(values)
      .onConflictDoUpdate({
        target: examProctoringSummaries.participationId,
        set: setValues,
      })
      .returning();
    return row;
  }

  async updateReviewerDecision(input: {
    participationId: string;
    reviewerDecision: string;
    reviewerId?: string;
    reviewerNotes?: string | null;
    reviewedAt: Date;
  }): Promise<ExamProctoringSummaryEntity | null> {
    const [row] = await this.database
      .update(examProctoringSummaries)
      .set({
        reviewerDecision: input.reviewerDecision,
        reviewerId: input.reviewerId,
        reviewerNotes: input.reviewerNotes ?? null,
        reviewedAt: input.reviewedAt,
        updatedAt: new Date(),
      })
      .where(eq(examProctoringSummaries.participationId, input.participationId))
      .returning();
    return row ?? null;
  }
}
