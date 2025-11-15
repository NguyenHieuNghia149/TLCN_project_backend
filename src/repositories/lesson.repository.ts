import { LessonEntity, LessonInsert, lessons, topics } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { LessonResponse } from '@/validations/lesson.validation';
import { eq } from 'drizzle-orm';

export class LessonRepository extends BaseRepository<typeof lessons, LessonEntity, LessonInsert> {
  constructor() {
    super(lessons);
  }

  async createLesson(lessonData: LessonInsert): Promise<LessonEntity> {
    const [lesson] = await this.db.insert(lessons).values(lessonData).returning();

    if (!lesson) {
      throw new Error('Failed to create lesson');
    }
    return lesson;
  }

  async getAllLessons(): Promise<(LessonResponse & { isFavorite: boolean })[]> {
    const lessonSelect = await this.db
      .select({
        id: lessons.id,
        title: lessons.title,
        content: lessons.content,
        topicId: lessons.topicId,
        topicName: topics.topicName,
        createdAt: lessons.createdAt,
        updatedAt: lessons.updatedAt,
      })
      .from(lessons)
      .leftJoin(topics, eq(lessons.topicId, topics.id));

    return lessonSelect.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      topicId: lesson.topicId,
      topicName: lesson.topicName,
      isFavorite: false,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    }));
  }
}
