import { LearningProcessRepository, LearningProgressResponse, TopicProgress, LessonProgress, LessonProgressResponse } from '@/repositories/learningprocess.repository';

export class LearningProcessService {
  private learningProcessRepository: LearningProcessRepository;

  constructor() {
    this.learningProcessRepository = new LearningProcessRepository();
  }

  /**
   * Get complete learning progress for a user
   */
  async getUserLearningProgress(userId: string): Promise<LearningProgressResponse> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      return await this.learningProcessRepository.getUserLearningProgress(userId);
    } catch (error) {
      console.error('Error in getUserLearningProgress:', error);
      throw error;
    }
  }

  /**
   * Get progress for a specific topic
   */
  async getTopicProgress(userId: string, topicId: string): Promise<TopicProgress | null> {
    try {
      if (!userId || !topicId) {
        throw new Error('User ID and Topic ID are required');
      }

      return await this.learningProcessRepository.getTopicProgress(userId, topicId);
    } catch (error) {
      console.error('Error in getTopicProgress:', error);
      throw error;
    }
  }

  /**
   * Get the most recent topic with submissions
   */
  async getRecentTopic(userId: string): Promise<TopicProgress | null> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const progress = await this.learningProcessRepository.getUserLearningProgress(userId);
      return progress.recentTopic || null;
    } catch (error) {
      console.error('Error in getRecentTopic:', error);
      throw error;
    }
  }

  /**
   * Get complete lesson progress for a user
   */
  async getUserLessonProgress(userId: string): Promise<LessonProgressResponse> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      return await this.learningProcessRepository.getUserLessonProgress(userId);
    } catch (error) {
      console.error('Error in getUserLessonProgress:', error);
      throw error;
    }
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
    try {
      if (!userId || !lessonId) {
        throw new Error('User ID and Lesson ID are required');
      }

      return await this.learningProcessRepository.getLessonProgress(userId, lessonId);
    } catch (error) {
      console.error('Error in getLessonProgress:', error);
      throw error;
    }
  }

  /**
   * Get the most recent lesson completed
   */
  async getRecentLesson(userId: string): Promise<LessonProgress | null> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const progress = await this.learningProcessRepository.getUserLessonProgress(userId);
      return progress.recentLesson || null;
    } catch (error) {
      console.error('Error in getRecentLesson:', error);
      throw error;
    }
  }
}
