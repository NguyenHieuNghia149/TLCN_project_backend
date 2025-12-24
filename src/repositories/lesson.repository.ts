import { LessonEntity, LessonInsert, lessons, topics, comments, learnedLessons } from '@/database/schema';
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
        videoUrl: lessons.videoUrl,
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
      videoUrl: lesson.videoUrl,
      topicId: lesson.topicId,
      topicName: lesson.topicName,
      isFavorite: false,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    }));
  }

  async getLessonsByTopicId(topicId: string): Promise<LessonEntity[]> {
    const result = await this.db
      .select()
      .from(lessons)
      .where(eq(lessons.topicId, topicId));

    return result;
  }

  async deleteWithRelations(lessonId: string): Promise<boolean> {
    // Delete all comments related to this lesson
    await this.db.delete(comments).where(eq(comments.lessonId, lessonId));

    // Delete all learned_lessons records related to this lesson
    await this.db.delete(learnedLessons).where(eq(learnedLessons.lessonId, lessonId));

    // Delete the lesson itself
    return await this.delete(lessonId);
  }
}
