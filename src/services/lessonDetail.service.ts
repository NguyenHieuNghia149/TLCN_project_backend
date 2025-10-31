import { LessonDetailRepository, LessonDetailResponse } from '@/repositories/lessonDetail.repository';
import { LessonDetailNotFoundError } from '../exceptions/lesson.exceptions';

export class LessonDetailService {
  private lessonDetailRepository: LessonDetailRepository;

  constructor() {
    this.lessonDetailRepository = new LessonDetailRepository();
  }

  async getLessonById(lessonId: string): Promise<LessonDetailResponse> {
    const lesson = await this.lessonDetailRepository.getLessonById(lessonId);
    
    if (!lesson) {
      throw new LessonDetailNotFoundError(`Lesson with ID ${lessonId} not found`);
    }

    return lesson;
  }

  async getLessonsByTopicId(topicId: string): Promise<LessonDetailResponse[]> {
    const lessons = await this.lessonDetailRepository.getLessonsByTopicId(topicId);
    return lessons;
  }

  async getAllLessons(): Promise<LessonDetailResponse[]> {
    // Reuse the existing lesson repository method
    const lessonRepository = new (await import('@/repositories/lesson.repository')).LessonRepository();
    const lessons = await lessonRepository.getAllLessons();
    
    // Convert to LessonDetailResponse format
    return lessons.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: null, // This field might not be available in the basic lesson response
      topicId: lesson.topicId,
      topicName: lesson.topicName,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    }));
  }
}
