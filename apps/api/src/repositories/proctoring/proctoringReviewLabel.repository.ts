import { desc, eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringReviewLabelEntity,
  ExamProctoringReviewLabelInsert,
  examProctoringReviewLabels,
} from '@backend/shared/db/schema';

export class ProctoringReviewLabelRepository {
  constructor(private readonly database: any = db) {}

  async upsertReviewerLabel(
    values: ExamProctoringReviewLabelInsert
  ): Promise<ExamProctoringReviewLabelEntity> {
    const [row] = await this.database
      .insert(examProctoringReviewLabels)
      .values(values)
      .onConflictDoUpdate({
        target: [
          examProctoringReviewLabels.participationId,
          examProctoringReviewLabels.reviewerId,
          examProctoringReviewLabels.labelSchemaVersion,
        ],
        set: {
          summaryId: values.summaryId,
          reviewOutcome: values.reviewOutcome,
          evidenceConfidence: values.evidenceConfidence,
          notes: values.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringReviewLabelEntity[]> {
    return this.database
      .select()
      .from(examProctoringReviewLabels)
      .where(eq(examProctoringReviewLabels.participationId, participationId))
      .orderBy(desc(examProctoringReviewLabels.createdAt));
  }

  async findByExamId(examId: string): Promise<ExamProctoringReviewLabelEntity[]> {
    return this.database
      .select()
      .from(examProctoringReviewLabels)
      .where(eq(examProctoringReviewLabels.examId, examId))
      .orderBy(desc(examProctoringReviewLabels.createdAt));
  }
}
