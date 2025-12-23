import { topics, TopicEntity, TopicInsert, lessons, problems, comments, learnedLessons } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { SanitizationUtils } from '@/utils/security';
import { eq, sql } from 'drizzle-orm';
import { TopicAlreadyExistsException } from '@/exceptions/topic.exception';
import { TopicResponse } from '@/validations/topic.validation';

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
    await this.db.transaction(async (tx) => {
      // Get all lessons in this topic
      const topicLessons = await tx
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.topicId, topicId));

      const lessonIds = topicLessons.map(l => l.id);

      // Delete all comments related to lessons in this topic
      if (lessonIds.length > 0) {
        await tx
          .delete(comments)
          .where(sql`${comments.lessonId} IN (${sql.join(lessonIds)})`);

        // Delete all learned_lessons related to lessons in this topic
        await tx
          .delete(learnedLessons)
          .where(sql`${learnedLessons.lessonId} IN (${sql.join(lessonIds)})`);
      }

      // Delete all problems related to lessons in this topic
      await tx
        .delete(problems)
        .where(eq(problems.topicId, topicId));

      // Delete all lessons in this topic
      await tx
        .delete(lessons)
        .where(eq(lessons.topicId, topicId));

      // Delete the topic itself
      await tx
        .delete(topics)
        .where(eq(topics.id, topicId));
    });
  }

  async getTopicStats(topicId: string): Promise<TopicStatsData> {
    const lessonCount = await this.db
      .select()
      .from(lessons)
      .where(eq(lessons.topicId, topicId));

    const problemCount = await this.db
      .select()
      .from(problems)
      .where(eq(problems.topicId, topicId));

    return {
      totalLessons: lessonCount.length,
      totalProblems: problemCount.length,
    };
  }
}
