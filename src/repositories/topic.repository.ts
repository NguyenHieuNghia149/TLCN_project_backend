import { topics, TopicEntity, TopicInsert } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { SanitizationUtils } from '@/utils/security';
import { eq } from 'drizzle-orm';

export class TopicRepository extends BaseRepository<typeof topics, TopicEntity, TopicInsert> {
  constructor() {
    super(topics);
  }
  async createTopic(topicData: TopicInsert): Promise<TopicEntity> {
    const existingTopic = await this.findByName(topicData.topicName);
    if (existingTopic) {
      throw new Error(`Topic with topicName ${topicData.topicName} already exists`);
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
      .where(eq(topics.topicName, sanitizedTopicName))
      .limit(1);

    return selectedTopic || null;
  }
}
