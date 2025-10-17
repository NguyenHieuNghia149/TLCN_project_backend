import { topics, TopicEntity, TopicInsert } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { SanitizationUtils } from '@/utils/security';
import { eq, sql } from 'drizzle-orm';
import { TopicAlreadyExistsException } from '@/exceptions/topic.exception';
import { TopicResponse } from '@/validations/topic.validation';

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
}
