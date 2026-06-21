import { and, desc, eq, isNull, or } from 'drizzle-orm';

import {
  examParticipants,
  ExamParticipantEntity,
  ExamParticipantInsert,
} from '@backend/shared/db/schema';

import { BaseRepository } from './base.repository';

export class ExamParticipantRepository extends BaseRepository<
  typeof examParticipants,
  ExamParticipantEntity,
  ExamParticipantInsert
> {
  constructor() {
    super(examParticipants);
  }

  async findByExamAndIdentity(
    examId: string,
    identity: { normalizedEmail?: string | null; userId?: string | null },
  ): Promise<ExamParticipantEntity | null> {
    const predicates = [
      eq(examParticipants.examId, examId),
      isNull(examParticipants.mergedIntoParticipantId),
    ];

    const identityPredicates = [];
    if (identity.normalizedEmail) {
      identityPredicates.push(eq(examParticipants.normalizedEmail, identity.normalizedEmail));
    }

    if (identity.userId) {
      identityPredicates.push(eq(examParticipants.userId, identity.userId));
    }

    if (identityPredicates.length === 0) {
      return null;
    }

    const [participant] = await this.db
      .select()
      .from(examParticipants)
      .where(and(...predicates, or(...identityPredicates)))
      .orderBy(desc(examParticipants.createdAt))
      .limit(1);

    return participant || null;
  }

  async findByExamId(examId: string): Promise<ExamParticipantEntity[]> {
    return this.db
      .select()
      .from(examParticipants)
      .where(and(eq(examParticipants.examId, examId), isNull(examParticipants.mergedIntoParticipantId)))
      .orderBy(desc(examParticipants.createdAt));
  }

  async bindUser(id: string, userId: string): Promise<ExamParticipantEntity | null> {
    const [updated] = await this.db
      .update(examParticipants)
      .set({
        userId,
        updatedAt: new Date(),
      })
      .where(eq(examParticipants.id, id))
      .returning();

    return updated || null;
  }

  async updateAccessStatus(
    id: string,
    accessStatus: string | null,
  ): Promise<ExamParticipantEntity | null> {
    const [updated] = await this.db
      .update(examParticipants)
      .set({
        accessStatus,
        updatedAt: new Date(),
      })
      .where(eq(examParticipants.id, id))
      .returning();

    return updated || null;
  }

  async updateApproval(
    id: string,
    input: { approvalStatus: string; accessStatus?: string | null; approvedBy?: string | null },
  ): Promise<ExamParticipantEntity | null> {
    const [updated] = await this.db
      .update(examParticipants)
      .set({
        approvalStatus: input.approvalStatus,
        accessStatus: input.accessStatus,
        approvedBy: input.approvedBy ?? null,
        updatedAt: new Date(),
      })
      .where(eq(examParticipants.id, id))
      .returning();

    return updated || null;
  }

  async markInviteSent(id: string, inviteSentAt: Date): Promise<ExamParticipantEntity | null> {
    const [updated] = await this.db
      .update(examParticipants)
      .set({
        inviteSentAt,
        updatedAt: new Date(),
      })
      .where(eq(examParticipants.id, id))
      .returning();

    return updated || null;
  }

  async markJoined(id: string, joinedAt: Date): Promise<ExamParticipantEntity | null> {
    const [updated] = await this.db
      .update(examParticipants)
      .set({
        joinedAt,
        updatedAt: new Date(),
      })
      .where(eq(examParticipants.id, id))
      .returning();

    return updated || null;
  }

  async markMerged(sourceParticipantId: string, targetParticipantId: string): Promise<void> {
    await this.db
      .update(examParticipants)
      .set({
        mergedIntoParticipantId: targetParticipantId,
        mergedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(examParticipants.id, sourceParticipantId));
  }
}
