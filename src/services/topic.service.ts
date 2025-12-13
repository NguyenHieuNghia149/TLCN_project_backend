import { TopicRepository } from '@/repositories/topic.repository';
import { NotFoundException } from '@/exceptions/solution.exception';
import { CreateTopicInput, TopicResponse, UpdateTopicInput } from '@/validations/topic.validation';
import { BaseException } from '@/exceptions/auth.exceptions';

export class TopicService {
  private topicRepository: TopicRepository;

  constructor() {
    this.topicRepository = new TopicRepository();
  }

  async createTopic(topicData: CreateTopicInput): Promise<TopicResponse> {
    try {
      const topic = await this.topicRepository.createTopic({ topicName: topicData.topicName });

      if (!topic) {
        throw new BaseException('Failed to create topic', 500, 'FAILED_TO_CREATE_TOPIC');
      }

      return {
        id: topic.id,
        topicName: topic.topicName,
      };
    } catch (error) {
      throw error;
    }
  }

  async getTopicById(id: string): Promise<TopicResponse> {
    const topic = await this.topicRepository.findById(id);
    if (!topic) {
      throw new NotFoundException(`Topic with ID ${id} not found.`);
    }
    return {
      id: topic.id,
      topicName: topic.topicName,
    };
  }

  async getAllTopics(): Promise<TopicResponse[]> {
    const topics = await this.topicRepository.findMany({
      page: 1,
      limit: 1000,
    });
    return topics.data.map(topic => ({
      id: topic.id,
      topicName: topic.topicName,
    }));
  }

  async updateTopic(id: string, topicData: UpdateTopicInput): Promise<TopicResponse> {
    const topic = await this.topicRepository.update(id, { topicName: topicData.topicName });

    if (!topic) {
      throw new NotFoundException(`Topic with ID ${id} not found.`);
    }
    return {
      id: topic.id,
      topicName: topic.topicName,
    };
  }

  async deleteTopic(id: string): Promise<void> {
    const topic = await this.topicRepository.findById(id);
    if (!topic) {
      throw new NotFoundException(`Topic with ID ${id} not found.`);
    }
    await this.topicRepository.deleteTopicWithCascade(id);
  }
}
