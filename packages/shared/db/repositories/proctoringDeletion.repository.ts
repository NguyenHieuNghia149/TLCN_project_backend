import { eq, sql } from 'drizzle-orm';

import { db } from '../connection';
import {
  examProctoringAnomalyResults,
  examProctoringEvents,
  examProctoringLlmSummaries,
  examProctoringReviewLabels,
  examProctoringSummaries,
  proctoringAiJobs,
} from '../schema';

type TableRowCount = { tableName: string; rowCount: number };

function tableEntry(name: string, count: number): TableRowCount {
  return { tableName: name, rowCount: count };
}

export class ProctoringDeletionRepository {
  constructor(private readonly database: any = db) {}

  async dryRunCounts(
    participationId: string
  ): Promise<{ rows: TableRowCount[] }> {
    const counts: TableRowCount[] = [];

    const tables: [string, any][] = [
      ['exam_proctoring_events', examProctoringEvents],
      ['exam_proctoring_summaries', examProctoringSummaries],
      ['proctoring_ai_jobs', proctoringAiJobs],
      ['exam_proctoring_anomaly_results', examProctoringAnomalyResults],
      ['exam_proctoring_review_labels', examProctoringReviewLabels],
      ['exam_proctoring_llm_summaries', examProctoringLlmSummaries],
    ];

    for (const [name, table] of tables) {
      const [result] = await this.database
        .select({ total: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.participationId, participationId));
      counts.push(tableEntry(name, result?.total ?? 0));
    }

    return { rows: counts };
  }

  async anonymizeEvents(participationId: string): Promise<number> {
    const result = await this.database
      .update(examProctoringEvents)
      .set({
        payloadJson: null,
        updatedAt: new Date(),
      })
      .where(eq(examProctoringEvents.participationId, participationId));
    return result.rowCount ?? 0;
  }

  async anonymizeSummaries(participationId: string): Promise<number> {
    const result = await this.database
      .update(examProctoringSummaries)
      .set({
        eventCountsJson: null,
        velocityJson: null,
        updatedAt: new Date(),
      })
      .where(eq(examProctoringSummaries.participationId, participationId));
    return result.rowCount ?? 0;
  }

  async redactAiJobPayloads(participationId: string): Promise<number> {
    const result = await this.database
      .update(proctoringAiJobs)
      .set({
        payloadJson: null,
        resultJson: null,
        updatedAt: new Date(),
      })
      .where(eq(proctoringAiJobs.participationId, participationId));
    return result.rowCount ?? 0;
  }

  async redactAnomalyResults(participationId: string): Promise<number> {
    const result = await this.database
      .update(examProctoringAnomalyResults)
      .set({
        topContributorsJson: null,
        sourceEventRangeJson: null,
        updatedAt: new Date(),
      })
      .where(eq(examProctoringAnomalyResults.participationId, participationId));
    return result.rowCount ?? 0;
  }

  async redactReviewLabels(participationId: string): Promise<number> {
    const result = await this.database
      .update(examProctoringReviewLabels)
      .set({
        notes: null,
        updatedAt: new Date(),
      })
      .where(eq(examProctoringReviewLabels.participationId, participationId));
    return result.rowCount ?? 0;
  }

  async redactLlmSummaries(participationId: string): Promise<number> {
    const result = await this.database
      .update(examProctoringLlmSummaries)
      .set({
        summaryJson: null,
        riskFactsJson: null,
        missingDataNotesJson: null,
        modelNotesJson: null,
        sourceEventIdsJson: null,
        validationErrorsJson: null,
        updatedAt: new Date(),
      })
      .where(eq(examProctoringLlmSummaries.participationId, participationId));
    return result.rowCount ?? 0;
  }
}
