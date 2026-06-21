import {
  LessonDetailRepository,
  LessonDetailResponse,
} from '../repositories/lessonDetail.repository';
import { LessonRepository } from '../repositories/lesson.repository';
import { LessonDetailNotFoundError } from '../exceptions/lesson.exceptions';

export class LessonDetailService {
  private lessonDetailRepository: LessonDetailRepository;
  private lessonRepository: LessonRepository;

  constructor(deps: {
    lessonDetailRepository: LessonDetailRepository;
    lessonRepository: LessonRepository;
  }) {
    this.lessonDetailRepository = deps.lessonDetailRepository;
    this.lessonRepository = deps.lessonRepository;
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
    const lessons = await this.lessonRepository.getAllLessons();

    return lessons.map((lesson: any) => ({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: null,
      topicId: lesson.topicId,
      topicName: lesson.topicName,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    }));
  }
}

/** Creates a LessonDetailService with concrete repository dependencies. */
export function createLessonDetailService(): LessonDetailService {
  return new LessonDetailService({
    lessonDetailRepository: new LessonDetailRepository(),
    lessonRepository: new LessonRepository(),
  });
}
