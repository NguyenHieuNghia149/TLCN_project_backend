import { logger } from '@backend/shared/utils';
import { LessonRepository } from '../repositories/lesson.repository';
import { TopicRepository } from '../repositories/topic.repository';
import {
  CreateLessonInput,
  UpdateLessonInput,
  LessonResponse,
} from '@backend/shared/validations/lesson.validation';
import { NotFoundException } from '../exceptions/solution.exception';
import { BaseException } from '../exceptions/auth.exceptions';
import { FavoriteRepository } from '../repositories/favorite.repository';

type LessonServiceDependencies = {
  lessonRepository: LessonRepository;
  topicRepository: TopicRepository;
  favoriteRepository: FavoriteRepository;
};

export class LessonService {
  private lessonRepository: LessonRepository;
  private topicRepository: TopicRepository;
  private favoriteRepository: FavoriteRepository;

  constructor({ lessonRepository, topicRepository, favoriteRepository }: LessonServiceDependencies) {
    this.lessonRepository = lessonRepository;
    this.topicRepository = topicRepository;
    this.favoriteRepository = favoriteRepository;
  }

  async createLesson(lessonData: CreateLessonInput): Promise<LessonResponse> {
    try {
      const topic = await this.topicRepository.findById(lessonData.topicId);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${lessonData.topicId} not found.`);
      }

      const lesson = await this.lessonRepository.createLesson({
        title: lessonData.title,
        content: lessonData.content || null,
        videoUrl: lessonData.videoUrl || null,
        topicId: lessonData.topicId,
      });

      if (!lesson) {
        throw new BaseException('Failed to create lesson', 500, 'FAILED_TO_CREATE_LESSON');
      }

      const topicForName = await this.topicRepository.findById(lesson.topicId);
      return {
        id: lesson.id,
        title: lesson.title,
        content: lesson.content,
        videoUrl: lesson.videoUrl || null,
        topicId: lesson.topicId,
        topicName: topicForName?.topicName || null,
        isFavorite: false,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  async getLessonById(id: string): Promise<LessonResponse> {
    const lesson = await this.lessonRepository.findById(id);
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found.`);
    }

    const topicForName = await this.topicRepository.findById(lesson.topicId);
    return {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.videoUrl || null,
      topicId: lesson.topicId,
      topicName: topicForName?.topicName || null,
      isFavorite: false,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }

  async getAllLessons(
    userId?: string,
    topicId?: string
  ): Promise<(LessonResponse & { isFavorite: boolean })[]> {
    let lessons = await this.lessonRepository.getAllLessons();

    if (topicId) {
      lessons = lessons.filter(lesson => lesson.topicId === topicId);
    }

    if (userId) {
      const lessonIds = lessons.map(lesson => lesson.id);
      const favoriteSet = await this.favoriteRepository.getFavoriteLessonIds(userId, lessonIds);

      return lessons.map(lesson => ({
        ...lesson,
        isFavorite: favoriteSet.has(lesson.id),
      }));
    }

    return lessons.map(lesson => ({
      ...lesson,
      isFavorite: false,
    }));
  }

  async updateLesson(id: string, lessonData: UpdateLessonInput): Promise<LessonResponse> {
    if (lessonData.topicId) {
      const topic = await this.topicRepository.findById(lessonData.topicId);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${lessonData.topicId} not found.`);
      }
    }

    const updateData: Record<string, any> = {};

    if (lessonData.title !== undefined) updateData.title = lessonData.title;
    if (lessonData.content !== undefined) updateData.content = lessonData.content;
    if (lessonData.topicId !== undefined) updateData.topicId = lessonData.topicId;

    if (
      lessonData.videoUrl === undefined ||
      lessonData.videoUrl === '' ||
      lessonData.videoUrl === null
    ) {
      updateData.videoUrl = null;
    } else {
      updateData.videoUrl = lessonData.videoUrl;
    }

    let lesson;
    if (Object.keys(updateData).length > 0) {
      logger.info('Updating with data:', updateData);
      lesson = await this.lessonRepository.update(id, updateData);
      logger.info('Updated lesson:', lesson);
    } else {
      lesson = await this.lessonRepository.findById(id);
    }

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found.`);
    }
    const topicForName = await this.topicRepository.findById(lesson.topicId);
    return {
      id: lesson.id,
      title: lesson.title,
      videoUrl: lesson.videoUrl || null,
      content: lesson.content,
      topicId: lesson.topicId,
      topicName: topicForName?.topicName || null,
      isFavorite: false,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }

  async deleteLesson(id: string): Promise<void> {
    const lesson = await this.lessonRepository.findById(id);
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found.`);
    }

    try {
      await this.lessonRepository.deleteWithRelations(id);
    } catch (error) {
      throw new BaseException(
        'Failed to delete lesson and related records',
        500,
        'FAILED_TO_DELETE_LESSON'
      );
    }
  }
}

/** Creates a LessonService with concrete repository dependencies. */
export function createLessonService(): LessonService {
  return new LessonService({
    lessonRepository: new LessonRepository(),
    topicRepository: new TopicRepository(),
    favoriteRepository: new FavoriteRepository(),
  });
}
