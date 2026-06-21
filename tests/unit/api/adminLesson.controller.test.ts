import AdminLessonController from '@backend/api/controllers/admin/adminLesson.controller';
import { createMockResponse } from './controller-test-helpers';

describe('AdminLessonController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected admin lesson service to list lessons', async () => {
    const result = { items: [{ id: 'lesson-1' }], total: 1 };
    const adminLessonService = {
      listLessons: jest.fn().mockResolvedValue(result),
    } as any;
    const controller = new AdminLessonController(adminLessonService);
    const response = createMockResponse();

    await controller.list({ query: {} } as any, response as any);

    expect(adminLessonService.listLessons).toHaveBeenCalledWith(
      {
        search: undefined,
        topicId: undefined,
        title: undefined,
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
