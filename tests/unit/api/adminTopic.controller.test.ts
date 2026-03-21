import { AdminTopicController } from '@backend/api/controllers/admin/adminTopic.controller';
import { createMockResponse } from './controller-test-helpers';

describe('AdminTopicController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected admin topic service to list topics', async () => {
    const result = { items: [{ id: 'topic-1' }], total: 1 };
    const adminTopicService = {
      listTopics: jest.fn().mockResolvedValue(result),
    } as any;
    const controller = new AdminTopicController(adminTopicService);
    const response = createMockResponse();

    await controller.list({ query: {} } as any, response as any);

    expect(adminTopicService.listTopics).toHaveBeenCalledWith(
      {
        search: undefined,
        topicName: undefined,
      },
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(result);
  });
});
