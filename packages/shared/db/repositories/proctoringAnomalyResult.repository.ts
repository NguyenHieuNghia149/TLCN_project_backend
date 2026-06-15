import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../connection';
import {
  ExamProctoringAnomalyResultEntity,
  ExamProctoringAnomalyResultInsert,
  examProctoringAnomalyResults,
} from '../schema';

export class ProctoringAnomalyResultRepository {
  constructor(private readonly database: any = db) {}

  async upsertByWindowModel(
    values: ExamProctoringAnomalyResultInsert
  ): Promise<ExamProctoringAnomalyResultEntity> {
    const [row] = await this.database
      .insert(examProctoringAnomalyResults)
      .values(values)
      .onConflictDoUpdate({
        target: [
          examProctoringAnomalyResults.participationId,
          examProctoringAnomalyResults.windowId,
          examProctoringAnomalyResults.modelVersion,
        ],
        set: {
          jobId: values.jobId,
          sessionId: values.sessionId,
          windowStart: values.windowStart,
          windowEnd: values.windowEnd,
          featureSchemaVersion: values.featureSchemaVersion,
          scoringSchemaVersion: values.scoringSchemaVersion,
          anomalyScore: values.anomalyScore,
          rawScore: values.rawScore,
          riskLevel: values.riskLevel,
          explanationStatus: values.explanationStatus,
          topContributorsJson: values.topContributorsJson,
          explanationSkippedReason: values.explanationSkippedReason,
          sourceEventRangeJson: values.sourceEventRangeJson,
          updatedAt: new Date(),
          explainedAt: values.explainedAt,
        },
      })
      .returning();
    return row;
  }

  async findLatestByParticipation(
    participationId: string
  ): Promise<ExamProctoringAnomalyResultEntity[]> {
    return this.database
      .select()
      .from(examProctoringAnomalyResults)
      .where(eq(examProctoringAnomalyResults.participationId, participationId))
      .orderBy(desc(examProctoringAnomalyResults.windowStart));
  }

  async countDistinctParticipationsByExamModel(input: {
    examId: string;
    modelVersion: string;
  }): Promise<number> {
    const [row] = await this.database
      .select({
        count: sql<number>`count(distinct ${examProctoringAnomalyResults.participationId})`,
      })
      .from(examProctoringAnomalyResults)
      .where(
        and(
          eq(examProctoringAnomalyResults.examId, input.examId),
          eq(examProctoringAnomalyResults.modelVersion, input.modelVersion)
        )
      );
    return Number(row?.count ?? 0);
  }

  async updateExplanationStatus(input: {
    participationId: string;
    windowId: string;
    modelVersion: string;
    explanationStatus: string;
    explanationSkippedReason?: string | null;
    topContributorsJson?: Array<Record<string, unknown>>;
    explainedAt?: Date | null;
  }): Promise<ExamProctoringAnomalyResultEntity | null> {
    const patch: Partial<ExamProctoringAnomalyResultInsert> = {
      explanationStatus: input.explanationStatus,
      explanationSkippedReason: input.explanationSkippedReason,
      explainedAt: input.explainedAt,
      updatedAt: new Date(),
    };
    if (input.topContributorsJson !== undefined) {
      patch.topContributorsJson = input.topContributorsJson as any;
    }

    const [row] = await this.database
      .update(examProctoringAnomalyResults)
      .set(patch)
      .where(
        and(
          eq(examProctoringAnomalyResults.participationId, input.participationId),
          eq(examProctoringAnomalyResults.windowId, input.windowId),
          eq(examProctoringAnomalyResults.modelVersion, input.modelVersion)
        )
      )
      .returning();
    return row ?? null;
  }
}
