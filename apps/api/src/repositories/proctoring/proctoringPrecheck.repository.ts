import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringPrecheckEntity,
  ExamProctoringPrecheckInsert,
  examProctoringPrechecks,
} from '@backend/shared/db/schema';

export class ProctoringPrecheckRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringPrecheckInsert): Promise<ExamProctoringPrecheckEntity> {
    const [created] = await this.database.insert(examProctoringPrechecks).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringPrecheckEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringPrechecks)
      .where(eq(examProctoringPrechecks.id, id))
      .limit(1);
    return row ?? null;
  }

  async findValidPassedById(
    id: string,
    now: Date = new Date(),
  ): Promise<ExamProctoringPrecheckEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringPrechecks)
      .where(
        and(
          eq(examProctoringPrechecks.id, id),
          eq(examProctoringPrechecks.passed, true),
          gt(examProctoringPrechecks.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringPrecheckEntity[]> {
    return this.database
      .select()
      .from(examProctoringPrechecks)
      .where(eq(examProctoringPrechecks.participationId, participationId))
      .orderBy(desc(examProctoringPrechecks.createdAt));
  }
}
