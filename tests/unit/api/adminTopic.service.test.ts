import {
  AdminTopicService,
  createAdminTopicService,
} from '@backend/api/services/admin/adminTopic.service';
import { TopicRepository } from '@backend/api/repositories/topic.repository';

describe('AdminTopicService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to load a topic by id', async () => {
    const topicRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'topic-1', topicName: 'Basics' }),
    } as any;
    const service = new AdminTopicService({ topicRepository });

    const result = await service.getTopicById('topic-1');

    expect(topicRepository.findById).toHaveBeenCalledWith('topic-1');
    expect(result).toEqual({ id: 'topic-1', topicName: 'Basics' });
  });

  it('creates a service wired with a concrete topic repository', () => {
    const service = createAdminTopicService();

    expect(service).toBeInstanceOf(AdminTopicService);
    expect((service as any).repository).toBeInstanceOf(TopicRepository);
  });
});
