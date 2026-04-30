import { LearnedLessonRepository } from '../repositories/learned-lesson.repository';

import { createRoadmapProgressRepository, RoadmapProgressRepository } from '@backend/api/repositories/roadmapProgress.repository';

export class LearnedLessonService {
  private learnedLessonRepository: LearnedLessonRepository;
  private roadmapProgressRepository: RoadmapProgressRepository;

  constructor(deps: { 
    learnedLessonRepository: LearnedLessonRepository;
    roadmapProgressRepository: RoadmapProgressRepository;
  }) {
    this.learnedLessonRepository = deps.learnedLessonRepository;
    this.roadmapProgressRepository = deps.roadmapProgressRepository;
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
      if (result) {
        // Auto-progress any roadmaps the user is tracking that contain this lesson
        await this.roadmapProgressRepository.markItemCompletedInAllUserRoadmaps(userId, lessonId, 'lesson').catch(err => {
          console.error('Failed to auto-progress roadmap items for lesson', err);
        });
      }
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
      return lessons.map((lesson: any) => lesson.lessonId);
    } catch (error) {
      throw error;
    }
  }
}

/** Creates a LearnedLessonService with concrete repository dependencies. */
export function createLearnedLessonService(): LearnedLessonService {
  return new LearnedLessonService({
    learnedLessonRepository: new LearnedLessonRepository(),
    roadmapProgressRepository: createRoadmapProgressRepository(),
  });
}
