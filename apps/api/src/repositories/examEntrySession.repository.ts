import { and, desc, eq, isNull } from 'drizzle-orm';

import {
  examEntrySessions,
  ExamEntrySessionEntity,
  ExamEntrySessionInsert,
} from '@backend/shared/db/schema';

import { BaseRepository } from './base.repository';

export class ExamEntrySessionRepository extends BaseRepository<
  typeof examEntrySessions,
  ExamEntrySessionEntity,
  ExamEntrySessionInsert
> {
  constructor() {
    super(examEntrySessions);
  }

  async findLatestByParticipant(participantId: string): Promise<ExamEntrySessionEntity | null> {
    const [session] = await this.db
      .select()
      .from(examEntrySessions)
      .where(eq(examEntrySessions.participantId, participantId))
      .orderBy(desc(examEntrySessions.createdAt))
      .limit(1);

    return session || null;
  }

  async findActiveVerifiedSessionByParticipant(
    participantId: string,
  ): Promise<ExamEntrySessionEntity | null> {
    const [session] = await this.db
      .select()
      .from(examEntrySessions)
      .where(
        and(
          eq(examEntrySessions.participantId, participantId),
          isNull(examEntrySessions.participationId),
        ),
      )
      .orderBy(desc(examEntrySessions.updatedAt))
      .limit(1);

    return session || null;
  }

  async createOrResumeOpenedSession(input: {
    examId: string;
    participantId: string;
    inviteId?: string | null;
    expiresAt: Date;
  }): Promise<ExamEntrySessionEntity> {
    const existing = await this.findActiveVerifiedSessionByParticipant(input.participantId);
    if (existing && existing.status === 'opened') {
      return existing;
    }

    return this.create({
      examId: input.examId,
      participantId: input.participantId,
      inviteId: input.inviteId ?? null,
      verificationMethod: 'otp_email',
      status: 'opened',
      expiresAt: input.expiresAt,
      lastSeenAt: new Date(),
    });
  }

  async createOrResumeVerifiedSession(input: {
    examId: string;
    participantId: string;
    inviteId?: string | null;
    verificationMethod: string;
    verifiedAt: Date;
    expiresAt: Date;
  }): Promise<ExamEntrySessionEntity> {
    const existing = await this.findLatestByParticipant(input.participantId);
    if (existing && existing.status !== 'expired' && !existing.participationId) {
      const [updated] = await this.db
        .update(examEntrySessions)
        .set({
          inviteId: input.inviteId ?? existing.inviteId ?? null,
          verificationMethod: input.verificationMethod,
          status: 'eligible',
          verifiedAt: input.verifiedAt,
          expiresAt: input.expiresAt,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(examEntrySessions.id, existing.id))
        .returning();

      return updated || existing;
    }

    return this.create({
      examId: input.examId,
      participantId: input.participantId,
      inviteId: input.inviteId ?? null,
      verificationMethod: input.verificationMethod,
      status: 'eligible',
      verifiedAt: input.verifiedAt,
      expiresAt: input.expiresAt,
      lastSeenAt: new Date(),
    });
  }

  async markStarted(
    id: string,
    participationId: string,
    lastSeenAt: Date = new Date(),
  ): Promise<ExamEntrySessionEntity | null> {
    const [updated] = await this.db
      .update(examEntrySessions)
      .set({
        participationId,
        status: 'started',
        lastSeenAt,
        updatedAt: new Date(),
      })
      .where(eq(examEntrySessions.id, id))
      .returning();

    return updated || null;
  }

  async markExpired(id: string): Promise<ExamEntrySessionEntity | null> {
    const [updated] = await this.db
      .update(examEntrySessions)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(eq(examEntrySessions.id, id))
      .returning();

    return updated || null;
  }

  async touch(id: string): Promise<void> {
    await this.db
      .update(examEntrySessions)
      .set({
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(examEntrySessions.id, id));
  }

  async reassignParticipant(sourceParticipantId: string, targetParticipantId: string): Promise<void> {
    await this.db
      .update(examEntrySessions)
      .set({
        participantId: targetParticipantId,
        updatedAt: new Date(),
      })
      .where(eq(examEntrySessions.participantId, sourceParticipantId));
  }
}
