import { SanitizationUtils } from '@backend/shared/utils';
import {
  topics,
  TopicEntity,
  TopicInsert,
  lessons,
  problems,
  comments,
  learnedLessons,
} from '@backend/shared/db/schema';
import { BaseRepository } from './base.repository';
import { eq, sql, count } from 'drizzle-orm';
import { TopicAlreadyExistsException } from '../exceptions/topic.exception';
import { TopicResponse } from '@backend/shared/validations/topic.validation';

export interface TopicStatsData {
  totalLessons: number;
  totalProblems: number;
}

export class TopicRepository extends BaseRepository<typeof topics, TopicEntity, TopicInsert> {
  constructor() {
    super(topics);
  }
  async createTopic(topicData: TopicInsert): Promise<TopicEntity> {
    const existingTopic = await this.findByName(topicData.topicName);
    if (existingTopic) {
      throw new TopicAlreadyExistsException('Topic name already exists');
    }

    const [topic] = await this.db.insert(topics).values(topicData).returning();

    if (!topic) {
      throw new Error('Failed to create topic');
    }
    return topic;
  }

  async findByName(topicName: string): Promise<TopicEntity | null> {
    const sanitizedTopicName = topicName.toLowerCase().trim();
    const [selectedTopic] = await this.db
      .select()
      .from(topics)
      .where(sql`LOWER(${topics.topicName}) = ${sanitizedTopicName}`)
      .limit(1);

    return selectedTopic || null;
  }

  async getAllTopics(): Promise<TopicResponse[]> {
    const topicSelect = await this.db
      .select({ id: topics.id, topicName: topics.topicName })
      .from(topics);

    return topicSelect;
  }

  async deleteTopicWithCascade(topicId: string): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.delete(comments).where(sql`
        ${comments.lessonId} IN (
          SELECT ${lessons.id} FROM ${lessons} WHERE ${lessons.topicId} = ${topicId}
        )
        OR ${comments.problemId} IN (
          SELECT ${problems.id} FROM ${problems} WHERE ${problems.topicId} = ${topicId}
        )
      `);

      await tx.delete(learnedLessons).where(sql`
        ${learnedLessons.lessonId} IN (
          SELECT ${lessons.id} FROM ${lessons} WHERE ${lessons.topicId} = ${topicId}
        )
      `);

      await tx.delete(problems).where(eq(problems.topicId, topicId));
      await tx.delete(lessons).where(eq(lessons.topicId, topicId));
      await tx.delete(topics).where(eq(topics.id, topicId));
    });
  }

  async getTopicStats(topicId: string): Promise<TopicStatsData> {
    const [lessonCountResult, problemCountResult] = await Promise.all([
      this.db.select({ total: count() }).from(lessons).where(eq(lessons.topicId, topicId)),
      this.db.select({ total: count() }).from(problems).where(eq(problems.topicId, topicId)),
    ]);

    return {
      totalLessons: Number(lessonCountResult[0]?.total ?? 0),
      totalProblems: Number(problemCountResult[0]?.total ?? 0),
    };
  }

  // --- Dashboard Methods ---

  async countTotal(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(topics);
    return result[0]?.count || 0;
  }

  async getTopicDistribution(
    limit: number = 6
  ): Promise<Array<{ name: string; lessons: number; problems: number }>> {
    const lessonCounts = this.db
      .select({
        topicId: lessons.topicId,
        totalLessons: count(),
      })
      .from(lessons)
      .groupBy(lessons.topicId)
      .as('lesson_counts');

    const problemCounts = this.db
      .select({
        topicId: problems.topicId,
        totalProblems: count(),
      })
      .from(problems)
      .groupBy(problems.topicId)
      .as('problem_counts');

    const rows = await this.db
      .select({
        name: topics.topicName,
        lessons: sql<number>`COALESCE(${lessonCounts.totalLessons}, 0)`,
        problems: sql<number>`COALESCE(${problemCounts.totalProblems}, 0)`,
      })
      .from(topics)
      .leftJoin(lessonCounts, eq(topics.id, lessonCounts.topicId))
      .leftJoin(problemCounts, eq(topics.id, problemCounts.topicId))
      .limit(limit);

    return rows.map(row => ({
      name: row.name || 'Unknown',
      lessons: Number(row.lessons ?? 0),
      problems: Number(row.problems ?? 0),
    }));
  }
}
