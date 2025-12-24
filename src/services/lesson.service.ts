import { LessonRepository } from '../repositories/lesson.repository';
import { TopicRepository } from '../repositories/topic.repository';
import { CreateLessonInput, UpdateLessonInput, LessonResponse } from '../validations/lesson.validation';
import { NotFoundException } from '../exceptions/solution.exception';
import { BaseException } from '../exceptions/auth.exceptions';
import { FavoriteRepository } from '../repositories/favorite.repository';

export class LessonService {
  private lessonRepository: LessonRepository;
  private topicRepository: TopicRepository;
  private favoriteRepository: FavoriteRepository;

  constructor() {
    this.lessonRepository = new LessonRepository();
    this.topicRepository = new TopicRepository();
    this.favoriteRepository = new FavoriteRepository();
  }

  async createLesson(lessonData: CreateLessonInput): Promise<LessonResponse> {
    try {
      // Verify topic exists
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

      // Get topic name for the response
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
    
    // Get topic name for the response
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

  async getAllLessons(userId?: string, topicId?: string): Promise<(LessonResponse & { isFavorite: boolean })[]> {
    let lessons = await this.lessonRepository.getAllLessons();

    // Filter by topicId if provided
    if (topicId) {
      lessons = lessons.filter(lesson => lesson.topicId === topicId);
    }

    // If userId provided, fetch favorite status for each lesson
    if (userId) {
      const lessonIds = lessons.map(l => l.id);
      const favoriteSet = await this.favoriteRepository.getFavoriteLessonIds(userId, lessonIds);
      
      return lessons.map(lesson => ({
        ...lesson,
        isFavorite: favoriteSet.has(lesson.id),
      }));
    }

    // If no userId, return all lessons with isFavorite as false
    return lessons.map(lesson => ({
      ...lesson,
      isFavorite: false,
    }));
  }

  async updateLesson(id: string, lessonData: UpdateLessonInput): Promise<LessonResponse> {
    // If topicId is being updated, verify the new topic exists
    if (lessonData.topicId) {
      const topic = await this.topicRepository.findById(lessonData.topicId);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${lessonData.topicId} not found.`);
      }
    }

    // Build update object, only include fields that are explicitly set
    const updateData: Record<string, any> = {};
    
    if (lessonData.title !== undefined) updateData.title = lessonData.title;
    if (lessonData.content !== undefined) updateData.content = lessonData.content;
    if (lessonData.topicId !== undefined) updateData.topicId = lessonData.topicId;
    
    // Handle videoUrl - remove if empty, null, or undefined
    if (lessonData.videoUrl === undefined || lessonData.videoUrl === '' || lessonData.videoUrl === null) {
      updateData.videoUrl = null;
    } else {
      updateData.videoUrl = lessonData.videoUrl;
    }

    // Only proceed with update if there are fields to update
    let lesson;
    if (Object.keys(updateData).length > 0) {
      console.log('Updating with data:', updateData);
      lesson = await this.lessonRepository.update(id, updateData);
      console.log('Updated lesson:', lesson);
    } else {
      lesson = await this.lessonRepository.findById(id);
    }

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found.`);
    }
    // Get topic name for the response
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

export default new LessonService();
