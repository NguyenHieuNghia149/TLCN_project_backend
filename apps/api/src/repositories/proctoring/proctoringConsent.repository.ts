import { and, desc, eq } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import {
  ExamProctoringConsentEntity,
  ExamProctoringConsentInsert,
  examProctoringConsents,
} from '@backend/shared/db/schema';

export class ProctoringConsentRepository {
  constructor(private readonly database: any = db) {}

  async insert(values: ExamProctoringConsentInsert): Promise<ExamProctoringConsentEntity> {
    const [created] = await this.database.insert(examProctoringConsents).values(values).returning();
    return created;
  }

  async findById(id: string): Promise<ExamProctoringConsentEntity | null> {
    const [row] = await this.database
      .select()
      .from(examProctoringConsents)
      .where(eq(examProctoringConsents.id, id))
      .limit(1);
    return row ?? null;
  }

  async findLatestAcceptedForCandidate(input: {
    examId: string;
    candidateUserId: string;
    clientSessionId?: string;
  }): Promise<ExamProctoringConsentEntity | null> {
    const predicates = [
      eq(examProctoringConsents.examId, input.examId),
      eq(examProctoringConsents.candidateUserId, input.candidateUserId),
      eq(examProctoringConsents.status, 'accepted'),
    ];
    if (input.clientSessionId) {
      predicates.push(eq(examProctoringConsents.clientSessionId, input.clientSessionId));
    }

    const [row] = await this.database
      .select()
      .from(examProctoringConsents)
      .where(and(...predicates))
      .orderBy(desc(examProctoringConsents.acceptedAt))
      .limit(1);
    return row ?? null;
  }

  async findByParticipation(participationId: string): Promise<ExamProctoringConsentEntity[]> {
    return this.database
      .select()
      .from(examProctoringConsents)
      .where(eq(examProctoringConsents.participationId, participationId))
      .orderBy(desc(examProctoringConsents.createdAt));
  }

  async withdraw(id: string, withdrawnAt: Date): Promise<ExamProctoringConsentEntity | null> {
    const [row] = await this.database
      .update(examProctoringConsents)
      .set({ status: 'withdrawn', withdrawnAt })
      .where(eq(examProctoringConsents.id, id))
      .returning();
    return row ?? null;
  }
}
