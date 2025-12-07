import {
  ExamParticipationInsert,
  ExamParticipationEntity,
  examParticipations,
} from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq, and, desc } from 'drizzle-orm';
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
        isCompleted: false,
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
      .where(and(eq(examParticipations.examId, examId), eq(examParticipations.isCompleted, false)));
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

  async getExamLeaderboard(
    examId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<
    Array<{
      userId: string;
      userName: string;
      email: string;
      totalScore: number;
      submittedAt: Date;
    }>
  > {
    // Get completed participations with user info, ordered by score and submission time
    const results = await db
      .select({
        userId: examParticipations.userId,
        email: users.email,
        totalScore: submissions.id, // placeholder - will be computed in service
        submittedAt: examParticipations.endTime,
      })
      .from(examParticipations)
      .innerJoin(users, eq(examParticipations.userId, users.id))
      .leftJoin(submissions, and(eq(submissions.userId, examParticipations.userId)))
      .where(and(eq(examParticipations.examId, examId), eq(examParticipations.isCompleted, true)))
      .orderBy(desc(examParticipations.endTime))
      .limit(limit)
      .offset(offset);

    return results as any;
  }
}
