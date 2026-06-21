import { and, desc, eq, isNull } from 'drizzle-orm';

import { examInvites, ExamInviteEntity, ExamInviteInsert } from '@backend/shared/db/schema';

import { BaseRepository } from './base.repository';

export class ExamInviteRepository extends BaseRepository<
  typeof examInvites,
  ExamInviteEntity,
  ExamInviteInsert
> {
  constructor() {
    super(examInvites);
  }

  async findLatestActiveByParticipant(participantId: string): Promise<ExamInviteEntity | null> {
    const [invite] = await this.db
      .select()
      .from(examInvites)
      .where(
        and(
          eq(examInvites.participantId, participantId),
          isNull(examInvites.revokedAt),
        ),
      )
      .orderBy(desc(examInvites.createdAt))
      .limit(1);

    return invite || null;
  }

  async findByTokenHash(tokenHash: string): Promise<ExamInviteEntity | null> {
    const [invite] = await this.db
      .select()
      .from(examInvites)
      .where(eq(examInvites.tokenHash, tokenHash))
      .limit(1);

    return invite || null;
  }

  async markOpened(id: string, openedAt: Date): Promise<ExamInviteEntity | null> {
    const [updated] = await this.db
      .update(examInvites)
      .set({
        openedAt,
        updatedAt: new Date(),
      })
      .where(eq(examInvites.id, id))
      .returning();

    return updated || null;
  }

  async markUsed(id: string, usedAt: Date): Promise<ExamInviteEntity | null> {
    const [updated] = await this.db
      .update(examInvites)
      .set({
        usedAt,
        updatedAt: new Date(),
      })
      .where(eq(examInvites.id, id))
      .returning();

    return updated || null;
  }

  async revoke(id: string, revokedAt: Date): Promise<ExamInviteEntity | null> {
    const [updated] = await this.db
      .update(examInvites)
      .set({
        revokedAt,
        updatedAt: new Date(),
      })
      .where(eq(examInvites.id, id))
      .returning();

    return updated || null;
  }

  async revokeActiveByParticipant(participantId: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(examInvites)
      .set({
        revokedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(examInvites.participantId, participantId),
          isNull(examInvites.revokedAt),
          isNull(examInvites.usedAt),
        ),
      );
  }

  async reassignParticipant(sourceParticipantId: string, targetParticipantId: string): Promise<void> {
    await this.db
      .update(examInvites)
      .set({
        participantId: targetParticipantId,
        updatedAt: new Date(),
      })
      .where(eq(examInvites.participantId, sourceParticipantId));
  }
}
