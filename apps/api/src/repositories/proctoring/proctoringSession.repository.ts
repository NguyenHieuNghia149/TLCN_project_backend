import { and, desc, eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringSessionEntity,
  ExamProctoringSessionInsert,
  examProctoringSessions,
} from '@backend/shared/db/schema';

export class ProctoringSessionRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringSessionInsert): Promise<ExamProctoringSessionEntity> {
    const [created] = await this.database.insert(examProctoringSessions).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringSessionEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringSessions)
      .where(eq(examProctoringSessions.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringSessionEntity[]> {
    return this.database
      .select()
      .from(examProctoringSessions)
      .where(eq(examProctoringSessions.participationId, participationId))
      .orderBy(desc(examProctoringSessions.startedAt));
  }

  async findActiveByParticipationAndClientSession(input: {
    participationId: string;
    clientSessionId: string;
  }): Promise<ExamProctoringSessionEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringSessions)
      .where(
        and(
          eq(examProctoringSessions.participationId, input.participationId),
          eq(examProctoringSessions.clientSessionId, input.clientSessionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async update(
    id: string,
    patch: Partial<ExamProctoringSessionInsert>,
  ): Promise<ExamProctoringSessionEntity | null> {
    const [row] = await this.database
      .update(examProctoringSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(examProctoringSessions.id, id))
      .returning();
    return row ?? null;
  }
}
