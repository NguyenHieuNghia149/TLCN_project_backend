import { TopicService, createTopicService } from '@backend/api/services/topic.service';
import { TopicRepository } from '@backend/api/repositories/topic.repository';

describe('TopicService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to fetch a topic by id', async () => {
    const topicRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'topic-1', topicName: 'Arrays' }),
    } as any;
    const service = new TopicService({ topicRepository });

    const result = await service.getTopicById('topic-1');

    expect(topicRepository.findById).toHaveBeenCalledWith('topic-1');
    expect(result).toEqual({
      id: 'topic-1',
      topicName: 'Arrays',
    });
  });

  it('creates a service wired with a concrete topic repository', () => {
    const service = createTopicService();

    expect(service).toBeInstanceOf(TopicService);
    expect((service as any).topicRepository).toBeInstanceOf(TopicRepository);
  });
});
