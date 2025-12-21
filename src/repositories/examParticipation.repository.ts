import {
  ExamParticipationInsert,
  ExamParticipationEntity,
  examParticipations,
} from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { EExamParticipationStatus } from '@/enums/examParticipationStatus.enum';
import { db } from '@/database/connection';
import { submissions, users } from '@/database/schema';

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
        // totalScore: submissions.id, // placeholder - will be computed by service
        submittedAt: examParticipations.endTime,
      })
      .from(examParticipations)
      .innerJoin(users, eq(examParticipations.userId, users.id))
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
