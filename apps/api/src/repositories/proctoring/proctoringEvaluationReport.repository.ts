import { and, desc, eq, or, sql } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringEvaluationReportEntity,
  ExamProctoringEvaluationReportInsert,
  examProctoringEvaluationReports,
} from '@backend/shared/db/schema';

export class ProctoringEvaluationReportRepository {
  constructor(private readonly database: any = db) {}

  async insert(
    values: ExamProctoringEvaluationReportInsert
  ): Promise<ExamProctoringEvaluationReportEntity> {
    const [created] = await this.database
      .insert(examProctoringEvaluationReports)
      .values(values)
      .returning();
    return created;
  }

  async findLatestForModel(
    modelVersion: string
  ): Promise<ExamProctoringEvaluationReportEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringEvaluationReports)
      .where(eq(examProctoringEvaluationReports.modelVersion, modelVersion))
      .orderBy(desc(examProctoringEvaluationReports.generatedAt))
      .limit(1);
    return row ?? null;
  }

  async findLatestForExamModel(input: {
    examId: string;
    modelVersion: string;
  }): Promise<ExamProctoringEvaluationReportEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringEvaluationReports)
      .where(
        and(
          or(
            sql`${examProctoringEvaluationReports.datasetSnapshotRef} like ${`manual-labels:${input.examId}:%`}`,
            sql`${examProctoringEvaluationReports.datasetSnapshotRef} like ${`internal-prepilot:${input.examId}%`}`
          ),
          eq(examProctoringEvaluationReports.modelVersion, input.modelVersion)
        )
      )
      .orderBy(desc(examProctoringEvaluationReports.generatedAt))
      .limit(1);
    return row ?? null;
  }
}
