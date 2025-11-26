import { eq, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { learnedLessons, LearnedLessonEntity, LearnedLessonInsert } from '@/database/schema';

export class LearnedLessonRepository extends BaseRepository<
  typeof learnedLessons,
  LearnedLessonEntity,
  LearnedLessonInsert
> {
  constructor() {
    super(learnedLessons);
  }

  /**
   * Check if user has completed a lesson
   */
  async hasUserCompletedLesson(userId: string, lessonId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: learnedLessons.id })
      .from(learnedLessons)
      .where(and(eq(learnedLessons.userId, userId), eq(learnedLessons.lessonId, lessonId)))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Mark lesson as completed
   */
  async markLessonAsCompleted(userId: string, lessonId: string): Promise<LearnedLessonEntity | null> {
    // Check if already completed
    const existing = await this.hasUserCompletedLesson(userId, lessonId);
    if (existing) {
      return await this.db
        .select()
        .from(learnedLessons)
        .where(and(eq(learnedLessons.userId, userId), eq(learnedLessons.lessonId, lessonId)))
        .then(result => result[0] || null);
    }

    // Create new entry
    return await this.create({
      userId,
      lessonId,
    });
  }

  /**
   * Get all completed lessons for a user
   */
  async getCompletedLessonsByUser(userId: string): Promise<LearnedLessonEntity[]> {
    return await this.db
      .select()
      .from(learnedLessons)
      .where(eq(learnedLessons.userId, userId));
  }

  /**
   * Get completed lessons count by lesson
   */
  async getCompletionCountByLesson(lessonId: string): Promise<number> {
    const result = await this.db
      .select({ count: learnedLessons.id })
      .from(learnedLessons)
      .where(eq(learnedLessons.lessonId, lessonId));

    return result.length;
  }
}
