import { LessonEntity, lessons, topics } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq } from 'drizzle-orm';

export interface LessonDetailResponse {
  id: string;
  title: string;
  content: string | null;
  videoUrl: string | null;
  topicId: string;
  topicName: string | null;
  createdAt: string;
  updatedAt: string;
}

export class LessonDetailRepository extends BaseRepository<typeof lessons, LessonEntity, any> {
  constructor() {
    super(lessons);
  }

  async getLessonById(lessonId: string): Promise<LessonDetailResponse | null> {
    const lessonSelect = await this.db
      .select({ 
        id: lessons.id, 
        title: lessons.title, 
        content: lessons.content,
        videoUrl: lessons.videoUrl,
        topicId: lessons.topicId,
        topicName: topics.topicName,
        createdAt: lessons.createdAt,
        updatedAt: lessons.updatedAt
      })
      .from(lessons)
      .leftJoin(topics, eq(lessons.topicId, topics.id))
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (lessonSelect.length === 0) {
      return null;
    }

    const lesson = lessonSelect[0];
    if (!lesson) {
      return null;
    }
    
    return {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.videoUrl,
      topicId: lesson.topicId,
      topicName: lesson.topicName,
      createdAt: lesson.createdAt?.toISOString() || '',
      updatedAt: lesson.updatedAt?.toISOString() || '',
    };
  }

  async getLessonsByTopicId(topicId: string): Promise<LessonDetailResponse[]> {
    const lessonSelect = await this.db
      .select({ 
        id: lessons.id, 
        title: lessons.title, 
        content: lessons.content,
        videoUrl: lessons.videoUrl,
        topicId: lessons.topicId,
        topicName: topics.topicName,
        createdAt: lessons.createdAt,
        updatedAt: lessons.updatedAt
      })
      .from(lessons)
      .leftJoin(topics, eq(lessons.topicId, topics.id))
      .where(eq(lessons.topicId, topicId));

    return lessonSelect.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.videoUrl,
      topicId: lesson.topicId,
      topicName: lesson.topicName,
      createdAt: lesson.createdAt?.toISOString() || '',
      updatedAt: lesson.updatedAt?.toISOString() || '',
    }));
  }
}
