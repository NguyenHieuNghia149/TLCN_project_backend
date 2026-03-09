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
import { SanitizationUtils } from '@backend/shared/utils';
import { eq, sql, count } from 'drizzle-orm';
import { TopicAlreadyExistsException } from '@/exceptions/topic.exception';
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
      // Get all lessons in this topic
      const topicLessons = await tx
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.topicId, topicId));

      const lessonIds = topicLessons.map(l => l.id);

      // Delete all comments related to lessons in this topic
      if (lessonIds.length > 0) {
        await tx.delete(comments).where(sql`${comments.lessonId} IN (${sql.join(lessonIds)})`);

        // Delete all learned_lessons related to lessons in this topic
        await tx
          .delete(learnedLessons)
          .where(sql`${learnedLessons.lessonId} IN (${sql.join(lessonIds)})`);
      }

      // Delete all problems related to lessons in this topic
      await tx.delete(problems).where(eq(problems.topicId, topicId));

      // Delete all lessons in this topic
      await tx.delete(lessons).where(eq(lessons.topicId, topicId));

      // Delete the topic itself
      await tx.delete(topics).where(eq(topics.id, topicId));
    });
  }

  async getTopicStats(topicId: string): Promise<TopicStatsData> {
    const lessonCount = await this.db.select().from(lessons).where(eq(lessons.topicId, topicId));

    const problemCount = await this.db.select().from(problems).where(eq(problems.topicId, topicId));

    return {
      totalLessons: lessonCount.length,
      totalProblems: problemCount.length,
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
    const allTopics = await this.db
      .select({
        id: topics.id,
        name: topics.topicName,
      })
      .from(topics)
      .limit(limit);

    const topicData: Array<{ name: string; lessons: number; problems: number }> = [];

    for (const topic of allTopics) {
      const [lessonsCount, problemsCount] = await Promise.all([
        this.db.select({ count: count() }).from(lessons).where(eq(lessons.topicId, topic.id)),
        this.db.select({ count: count() }).from(problems).where(eq(problems.topicId, topic.id)),
      ]);

      topicData.push({
        name: topic.name || 'Unknown',
        lessons: lessonsCount[0]?.count || 0,
        problems: problemsCount[0]?.count || 0,
      });
    }

    return topicData;
  }
}
