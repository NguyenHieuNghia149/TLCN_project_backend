import { LessonRepository } from '../repositories/lesson.repository';
import { TopicRepository } from '../repositories/topic.repository';
import { CreateLessonInput, UpdateLessonInput, LessonResponse } from '../validations/lesson.validation';
import { NotFoundException } from '../exceptions/solution.exception';
import { BaseException } from '../exceptions/auth.exceptions';

export class LessonService {
  private lessonRepository: LessonRepository;
  private topicRepository: TopicRepository;

  constructor() {
    this.lessonRepository = new LessonRepository();
    this.topicRepository = new TopicRepository();
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
        topicId: lesson.topicId,
        topicName: topicForName?.topicName || null,
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
      topicId: lesson.topicId,
      topicName: topicForName?.topicName || null,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }

  async getAllLessons(): Promise<LessonResponse[]> {
    return await this.lessonRepository.getAllLessons();
  }

  async updateLesson(id: string, lessonData: UpdateLessonInput): Promise<LessonResponse> {
    // If topicId is being updated, verify the new topic exists
    if (lessonData.topicId) {
      const topic = await this.topicRepository.findById(lessonData.topicId);
      if (!topic) {
        throw new NotFoundException(`Topic with ID ${lessonData.topicId} not found.`);
      }
    }

    const lesson = await this.lessonRepository.update(id, {
      title: lessonData.title,
      content: lessonData.content,
      topicId: lessonData.topicId,
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found.`);
    }
    // Get topic name for the response
    const topicForName = await this.topicRepository.findById(lesson.topicId);
    return {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      topicId: lesson.topicId,
      topicName: topicForName?.topicName || null,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }

  async deleteLesson(id: string): Promise<void> {
    const lesson = await this.lessonRepository.delete(id);
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${id} not found.`);
    }
  }
}

export default new LessonService();
