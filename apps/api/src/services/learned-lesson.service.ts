import { LearnedLessonRepository } from '@/repositories/learned-lesson.repository';

export class LearnedLessonService {
  private learnedLessonRepository: LearnedLessonRepository;

  constructor() {
    this.learnedLessonRepository = new LearnedLessonRepository();
  }

  /**
   * Check if user has completed a lesson
   */
  async hasUserCompletedLesson(userId: string, lessonId: string): Promise<boolean> {
    try {
      if (!userId || !lessonId) {
        throw new Error('User ID and Lesson ID are required');
      }

      return await this.learnedLessonRepository.hasUserCompletedLesson(userId, lessonId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark lesson as completed
   */
  async markLessonAsCompleted(userId: string, lessonId: string): Promise<boolean> {
    try {
      if (!userId || !lessonId) {
        throw new Error('User ID and Lesson ID are required');
      }

      const result = await this.learnedLessonRepository.markLessonAsCompleted(userId, lessonId);
      return !!result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all completed lessons for a user
   */
  async getCompletedLessonsByUser(userId: string): Promise<string[]> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const lessons = await this.learnedLessonRepository.getCompletedLessonsByUser(userId);
      return lessons.map(lesson => lesson.lessonId);
    } catch (error) {
      throw error;
    }
  }
}
