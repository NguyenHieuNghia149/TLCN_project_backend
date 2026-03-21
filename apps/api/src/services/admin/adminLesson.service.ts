import {
  AdminLessonRepository,
  LessonFilters,
  PaginationOptions,
  PaginatedResult,
  LessonWithTopic,
} from '@backend/api/repositories/admin/adminLesson.repository';
import { LessonInsert } from '@backend/shared/db/schema';
import { NotFoundException } from '@backend/api/exceptions/solution.exception';
import { BaseException } from '@backend/api/exceptions/auth.exceptions';

export class AdminLessonService {
  private repository: AdminLessonRepository;

  constructor(deps: { adminLessonRepository: AdminLessonRepository }) {
    this.repository = deps.adminLessonRepository;
  }

  async listLessons(
    filters: LessonFilters,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<LessonWithTopic>> {
    return this.repository.findLessonsWithFilters(filters, pagination);
  }

  async getLessonById(id: string): Promise<LessonWithTopic> {
    const lesson = await this.repository.findById(id);
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found`);
    }
    return lesson;
  }

  async createLesson(
    lessonData: Omit<LessonInsert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LessonWithTopic> {
    try {
      // Verify topic exists using repository
      const topicExists = await this.repository.verifyTopicExists(lessonData.topicId);
      if (!topicExists) {
        throw new NotFoundException(`Topic with ID ${lessonData.topicId} not found`);
      }

      const lesson = await this.repository.createLesson(lessonData);
      return this.getLessonById(lesson.id);
    } catch (error) {
      throw error;
    }
  }

  async updateLesson(
    id: string,
    lessonData: Partial<Omit<LessonInsert, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<LessonWithTopic> {
    try {
      const lesson = await this.repository.findById(id);
      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${id} not found`);
      }

      if (lessonData.topicId) {
        const topicExists = await this.repository.verifyTopicExists(lessonData.topicId);
        if (!topicExists) {
          throw new NotFoundException(`Topic with ID ${lessonData.topicId} not found`);
        }
      }

      const updateData = { ...lessonData };
      if (
        lessonData.videoUrl === undefined ||
        lessonData.videoUrl === '' ||
        lessonData.videoUrl === null
      ) {
        updateData.videoUrl = null;
      }

      await this.repository.updateLesson(id, updateData);
      return this.getLessonById(id);
    } catch (error) {
      throw error;
    }
  }

  async deleteLesson(id: string): Promise<void> {
    try {
      const lesson = await this.repository.findById(id);
      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${id} not found`);
      }

      await this.repository.deleteLesson(id);
    } catch (error) {
      throw error;
    }
  }
}

/** Creates an AdminLessonService with concrete repository dependencies. */
export function createAdminLessonService(): AdminLessonService {
  return new AdminLessonService({
    adminLessonRepository: new AdminLessonRepository(),
  });
}
