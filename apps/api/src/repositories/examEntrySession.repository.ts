import { and, desc, eq, isNull } from 'drizzle-orm';

import {
  examEntrySessions,
  ExamEntrySessionEntity,
  ExamEntrySessionInsert,
  examParticipations,
  ExamParticipationEntity,
} from '@backend/shared/db/schema';
import { EExamParticipationStatus } from '@backend/shared/types';

import { BaseRepository } from './base.repository';

class EntrySessionStartConflictError extends Error {}

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

  async findByParticipationId(
    participationId: string,
  ): Promise<ExamEntrySessionEntity | null> {
    const [session] = await this.db
      .select()
      .from(examEntrySessions)
      .where(eq(examEntrySessions.participationId, participationId))
      .orderBy(desc(examEntrySessions.updatedAt))
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

  async createAttemptAndMarkStartedIfEligible(input: {
    entrySessionId: string;
    examId: string;
    participantId: string;
    userId: string;
    startTime: Date;
    expiresAt: Date;
    attemptNumber: number;
  }): Promise<{
    participation: ExamParticipationEntity;
    entrySession: ExamEntrySessionEntity;
  } | null> {
    try {
      return await this.db.transaction(async (tx: any) => {
        const [participation] = await tx
          .insert(examParticipations)
          .values({
            examId: input.examId,
            participantId: input.participantId,
            userId: input.userId,
            startTime: input.startTime,
            expiresAt: input.expiresAt,
            attemptNumber: input.attemptNumber,
            status: EExamParticipationStatus.IN_PROGRESS,
            scoreStatus: 'pending',
          })
          .returning();

        if (!participation) {
          throw new Error('Failed to create exam participation');
        }

        const [entrySession] = await tx
          .update(examEntrySessions)
          .set({
            participationId: participation.id,
            status: 'started',
            lastSeenAt: input.startTime,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(examEntrySessions.id, input.entrySessionId),
              eq(examEntrySessions.status, 'eligible'),
              isNull(examEntrySessions.participationId),
            ),
          )
          .returning();

        if (!entrySession) {
          throw new EntrySessionStartConflictError();
        }

        return { participation, entrySession };
      });
    } catch (error) {
      if (error instanceof EntrySessionStartConflictError) {
        return null;
      }

      throw error;
    }
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
