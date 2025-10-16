import { NotFoundException } from '@/exceptions/solution.exception';
import { TopicRepository } from '@/repositories/topic.repository';
import { CreateTopicInput, TopicResponse } from '@/validations/topic.validation';

export class TopicService {
  private topicRepository: TopicRepository;

  constructor() {
    this.topicRepository = new TopicRepository();
  }

  async createTopic(topicData: CreateTopicInput): Promise<TopicResponse> {
    const topic = await this.topicRepository.createTopic(topicData);
    return {
      id: topic.id,
      topicName: topic.topicName,
    };
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
}
