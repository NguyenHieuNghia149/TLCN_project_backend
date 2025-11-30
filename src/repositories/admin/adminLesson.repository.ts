import { lessons, LessonEntity, LessonInsert } from '@/database/schema';
import { BaseRepository } from '../base.repository';
import { eq, like, desc, asc, and, or } from 'drizzle-orm';
import { db } from '@/database/connection';
import { topics, learnedLessons } from '@/database/schema';

export interface LessonFilters {
  search?: string;
  topicId?: string;
  title?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface LessonWithTopic extends LessonEntity {
  topicName?: string | null;
}

export class AdminLessonRepository extends BaseRepository<typeof lessons, LessonEntity, LessonInsert> {
  constructor() {
    super(lessons);
  }

  async findLessonsWithFilters(
    filters: LessonFilters,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<LessonWithTopic>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions: any[] = [];

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      whereConditions.push(
        or(
          like(lessons.title, searchPattern),
          like(lessons.content, searchPattern)
        )
      );
    }

    if (filters.topicId) {
      whereConditions.push(eq(lessons.topicId, filters.topicId));
    }

    if (filters.title) {
      whereConditions.push(like(lessons.title, `%${filters.title}%`));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Determine sort column
    let sortColumn: any = lessons.createdAt;
    if (sortBy === 'title') {
      sortColumn = lessons.title;
    } else if (sortBy === 'updatedAt') {
      sortColumn = lessons.updatedAt;
    }

    const sortFn = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Get total count
    const countResult = await db
      .select()
      .from(lessons)
      .where(whereClause);
    const total = countResult.length;

    // Get paginated results
    const results = await db
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
      .leftJoin(topics, eq(lessons.topicId, topics.id))
      .where(whereClause)
      .orderBy(sortFn)
      .limit(limit)
      .offset(offset);

    return {
      data: results as LessonWithTopic[],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<LessonWithTopic | null> {
    const result = await db
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
      .leftJoin(topics, eq(lessons.topicId, topics.id))
      .where(eq(lessons.id, id));

    return result.length > 0 ? (result[0] as LessonWithTopic) : null;
  }

  async createLesson(payload: LessonInsert): Promise<LessonEntity> {
    const [lesson] = await db.insert(lessons).values(payload).returning();
    if (!lesson) {
      throw new Error('Failed to create lesson');
    }
    return lesson;
  }

  async updateLesson(id: string, payload: Partial<LessonInsert>): Promise<LessonEntity> {
    const [lesson] = await db
      .update(lessons)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(lessons.id, id))
      .returning();

    if (!lesson) {
      throw new Error('Failed to update lesson');
    }
    return lesson;
  }

  async deleteLesson(id: string): Promise<void> {
    // Delete all learned lessons associated with this lesson first
    await db.delete(learnedLessons).where(eq(learnedLessons.lessonId, id));
    
    // Then delete the lesson itself
    await db.delete(lessons).where(eq(lessons.id, id));
  }

  async findByTopicId(topicId: string): Promise<LessonEntity[]> {
    return db.select().from(lessons).where(eq(lessons.topicId, topicId));
  }
}
