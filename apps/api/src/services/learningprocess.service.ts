import {
  createLearningProcessRepository,
  LearningProcessRepository,
} from '../repositories/learningprocess.repository';
import {
  TopicProgress,
  LessonProgress,
  LearningProgressResponse,
  LessonProgressResponse,
} from '@backend/shared/validations/learningprocess.validation';
import {
  UserIdRequiredException,
  TopicIdRequiredException,
  LessonIdRequiredException,
} from '../exceptions/learningprocess.exception';

export class LearningProcessService {
  private learningProcessRepository: LearningProcessRepository;

  constructor(deps: { learningProcessRepository: LearningProcessRepository }) {
    this.learningProcessRepository = deps.learningProcessRepository;
  }

  /**
   * Get complete learning progress for a user
   */
  async getUserLearningProgress(userId: string): Promise<LearningProgressResponse> {
    try {
      if (!userId) {
        throw new UserIdRequiredException();
      }

      return await this.learningProcessRepository.getUserLearningProgress(userId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get progress for a specific topic
   */
  async getTopicProgress(userId: string, topicId: string): Promise<TopicProgress | null> {
    try {
      if (!userId) {
        throw new UserIdRequiredException();
      }
      if (!topicId) {
        throw new TopicIdRequiredException();
      }

      return await this.learningProcessRepository.getTopicProgress(userId, topicId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the most recent topic with submissions
   */
  async getRecentTopic(userId: string): Promise<TopicProgress | null> {
    try {
      if (!userId) {
        throw new UserIdRequiredException();
      }

      const progress = await this.learningProcessRepository.getUserLearningProgress(userId);
      return progress.recentTopic || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get complete lesson progress for a user
   */
  async getUserLessonProgress(userId: string): Promise<LessonProgressResponse> {
    try {
      if (!userId) {
        throw new UserIdRequiredException();
      }

      return await this.learningProcessRepository.getUserLessonProgress(userId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get progress for a specific lesson
   */
  async getLessonProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
    try {
      if (!userId) {
        throw new UserIdRequiredException();
      }
      if (!lessonId) {
        throw new LessonIdRequiredException();
      }

      return await this.learningProcessRepository.getLessonProgress(userId, lessonId);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the most recent lesson completed
   */
  async getRecentLesson(userId: string): Promise<LessonProgress | null> {
    try {
      if (!userId) {
        throw new UserIdRequiredException();
      }

      const progress = await this.learningProcessRepository.getUserLessonProgress(userId);
      return progress.recentLesson || null;
    } catch (error) {
      throw error;
    }
  }
}

/** Creates a LearningProcessService with concrete repository dependencies. */
export function createLearningProcessService(): LearningProcessService {
  return new LearningProcessService({
    learningProcessRepository: createLearningProcessRepository(),
  });
}
