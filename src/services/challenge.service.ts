import { TopicRepository } from '@/repositories/topic.repository';

export class ChallengeService {
  private topicRepository: TopicRepository;
  constructor() {
    this.topicRepository = new TopicRepository();
  }
}
