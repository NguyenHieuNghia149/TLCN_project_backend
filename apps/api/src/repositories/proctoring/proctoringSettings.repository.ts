import { eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringSettingsEntity,
  ExamProctoringSettingsInsert,
  examProctoringSettings,
} from '@backend/shared/db/schema';

export class ProctoringSettingsRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringSettingsInsert): Promise<ExamProctoringSettingsEntity> {
    const [created] = await this.database.insert(examProctoringSettings).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringSettingsEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringSettings)
      .where(eq(examProctoringSettings.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByExamId(examId: string): Promise<ExamProctoringSettingsEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringSettings)
      .where(eq(examProctoringSettings.examId, examId))
      .limit(1);
    return row ?? null;
  }

  async upsertForExam(
    values: ExamProctoringSettingsInsert,
  ): Promise<ExamProctoringSettingsEntity> {
    const [row] = await this.database
      .insert(examProctoringSettings)
      .values(values)
      .onConflictDoUpdate({
        target: examProctoringSettings.examId,
        set: {
          ...values,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}
