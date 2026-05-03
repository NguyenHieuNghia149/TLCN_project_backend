import {
  ExamParticipationInsert,
  ExamParticipationEntity,
  examParticipations,
} from '@backend/shared/db/schema';
import { BaseRepository } from './base.repository';
import { eq, and, desc, inArray, count } from 'drizzle-orm';
import { EExamParticipationStatus } from '@backend/shared/types';
import { db } from '@backend/shared/db/connection';
import { submissions, users, examParticipants } from '@backend/shared/db/schema';

export class ExamParticipationRepository extends BaseRepository<
  typeof examParticipations,
  ExamParticipationEntity,
  ExamParticipationInsert
> {
  constructor() {
    super(examParticipations);
  }

  async createExamParticipation(
    examId: string,
    userId: string
  ): Promise<ExamParticipationEntity[]> {
    return await this.db
      .insert(this.table)
      .values({
        examId,
        userId,
        startTime: new Date(),
        status: EExamParticipationStatus.IN_PROGRESS,
      })
      .returning();
  }

  async createExamParticipationWithExpiry(
    examId: string,
    userId: string,
    startTime: Date,
    expiresAt: Date
  ): Promise<ExamParticipationEntity[]> {
    return await this.db
      .insert(this.table)
      .values({
        examId,
        userId,
        startTime,
        expiresAt,
        status: EExamParticipationStatus.IN_PROGRESS,
      })
      .returning();
  }

  async createAttempt(input: {
    examId: string;
    participantId: string;
    userId: string;
    startTime: Date;
    expiresAt: Date;
    attemptNumber: number;
  }): Promise<ExamParticipationEntity | null> {
    const [created] = await this.db
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

    return created || null;
  }

  async findByExamAndUser(examId: string, userId: string): Promise<ExamParticipationEntity | null> {
    const [participation] = await this.db
      .select()
      .from(examParticipations)
      .where(and(eq(examParticipations.examId, examId), eq(examParticipations.userId, userId)))
      .limit(1);

    return participation || null;
  }

  async findAllByExamAndUser(examId: string, userId: string): Promise<ExamParticipationEntity[]> {
    return this.db
      .select()
      .from(examParticipations)
      .where(and(eq(examParticipations.examId, examId), eq(examParticipations.userId, userId)))
      .orderBy(desc(examParticipations.startTime));
  }

  async findInProgressByExamAndUser(
    examId: string,
    userId: string
  ): Promise<ExamParticipationEntity | null> {
    const [participation] = await this.db
      .select()
      .from(examParticipations)
      .where(
        and(
          eq(examParticipations.examId, examId),
          eq(examParticipations.userId, userId),
          eq(examParticipations.status, 'IN_PROGRESS')
        )
      )
      .limit(1);

    return participation || null;
  }

  async findById(participationId: string): Promise<ExamParticipationEntity | null> {
    const [participation] = await this.db
      .select()
      .from(examParticipations)
      .where(eq(examParticipations.id, participationId))
      .limit(1);

    return participation || null;
  }

  async findByExamId(examId: string): Promise<ExamParticipationEntity[]> {
    return this.db
      .select()
      .from(examParticipations)
      .where(eq(examParticipations.examId, examId))
      .orderBy(desc(examParticipations.startTime));
  }

  async findByParticipantId(participantId: string): Promise<ExamParticipationEntity[]> {
    return this.db
      .select()
      .from(examParticipations)
      .where(eq(examParticipations.participantId, participantId))
      .orderBy(desc(examParticipations.startTime));
  }

  async countAttemptsByParticipant(participantId: string): Promise<number> {
    const [result] = await this.db
      .select({ total: count() })
      .from(examParticipations)
      .where(eq(examParticipations.participantId, participantId));

    return Number(result?.total || 0);
  }

  async findLatestByParticipant(participantId: string): Promise<ExamParticipationEntity | null> {
    const [participation] = await this.db
      .select()
      .from(examParticipations)
      .where(eq(examParticipations.participantId, participantId))
      .orderBy(desc(examParticipations.startTime))
      .limit(1);

    return participation || null;
  }

  async findByUserId(userId: string): Promise<ExamParticipationEntity[]> {
    return this.db
      .select()
      .from(examParticipations)
      .where(eq(examParticipations.userId, userId))
      .orderBy(desc(examParticipations.startTime));
  }

  async findIncompleteParticipations(examId: string): Promise<ExamParticipationEntity[]> {
    return this.db
      .select()
      .from(examParticipations)
      .where(
        and(
          eq(examParticipations.examId, examId),
          eq(examParticipations.status, EExamParticipationStatus.IN_PROGRESS)
        )
      );
  }

  /**
   * Find completed (SUBMITTED or EXPIRED) participation by exam and user
   */
  async findCompletedByExamAndUser(
    examId: string,
    userId: string
  ): Promise<ExamParticipationEntity | null> {
    const [participation] = await this.db
      .select()
      .from(examParticipations)
      .where(
        and(
          eq(examParticipations.examId, examId),
          eq(examParticipations.userId, userId),
          inArray(examParticipations.status, [
            EExamParticipationStatus.SUBMITTED,
            EExamParticipationStatus.EXPIRED,
          ])
        )
      )
      .orderBy(desc(examParticipations.submittedAt))
      .limit(1);

    return participation || null;
  }

  async updateParticipation(
    participationId: string,
    data: Partial<ExamParticipationInsert>
  ): Promise<ExamParticipationEntity | null> {
    const [updated] = await this.db
      .update(examParticipations)
      .set(data)
      .where(eq(examParticipations.id, participationId))
      .returning();

    return updated || null;
  }

  async reassignParticipant(sourceParticipantId: string, targetParticipantId: string): Promise<void> {
    await this.db
      .update(examParticipations)
      .set({
        participantId: targetParticipantId,
      })
      .where(eq(examParticipations.participantId, sourceParticipantId));
  }

  // Compatibility wrappers for session-style operations
  async createSession(data: ExamParticipationInsert): Promise<ExamParticipationEntity | null> {
    const [created] = await this.db.insert(this.table).values(data).returning();
    return created || null;
  }

  async updateSession(
    sessionId: string,
    data: Partial<ExamParticipationInsert>
  ): Promise<ExamParticipationEntity | null> {
    const [updated] = await this.db
      .update(examParticipations)
      .set(data)
      .where(eq(examParticipations.id, sessionId))
      .returning();
    return updated || null;
  }

  async getExamLeaderboard(
    examId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<
    Array<{
      participationId: string;
      userId: string;
      userFirstName: string | null;
      userLastName: string | null;
      email: string | null;
      fullName?: string | null;
      normalizedEmail?: string | null;
      // totalScore: number;
      submittedAt: Date | null;
      startTime: Date | null;
    }>
  > {
    // Get completed participations with user info, ordered by endTime
    const query = db
      .select({
        participationId: examParticipations.id,
        userId: examParticipations.userId,
        startTime: examParticipations.startTime,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        email: users.email,
        fullName: examParticipants.fullName,
        normalizedEmail: examParticipants.normalizedEmail,
        // totalScore: submissions.id, // placeholder - will be computed by service
        submittedAt: examParticipations.endTime,
      })
      .from(examParticipations)
      .innerJoin(users, eq(examParticipations.userId, users.id))
      .leftJoin(examParticipants, eq(examParticipations.participantId, examParticipants.id))
      // .leftJoin(submissions, and(eq(submissions.userId, examParticipations.userId)))
      .where(
        and(
          eq(examParticipations.examId, examId),
          inArray(examParticipations.status, [
            EExamParticipationStatus.SUBMITTED,
            EExamParticipationStatus.EXPIRED,
          ])
        )
      )
      .orderBy(desc(examParticipations.endTime));

    // Apply pagination only if provided (limit > 0)
    const results = await query.limit(limit).offset(offset);

    return results as any;
  }
}
