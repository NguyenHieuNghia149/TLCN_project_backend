import {
  AdminLessonService,
  createAdminLessonService,
} from '@backend/api/services/admin/adminLesson.service';
import { AdminLessonRepository } from '@backend/api/repositories/admin/adminLesson.repository';

describe('AdminLessonService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to list lessons', async () => {
    const result = { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
    const adminLessonRepository = {
      findLessonsWithFilters: jest.fn().mockResolvedValue(result),
    } as any;
    const service = new AdminLessonService({ adminLessonRepository });

    const response = await service.listLessons(
      { search: undefined, topicId: undefined, title: undefined },
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    );

    expect(adminLessonRepository.findLessonsWithFilters).toHaveBeenCalledTimes(1);
    expect(response).toEqual(result);
  });

  it('creates a service wired with a concrete admin lesson repository', () => {
    const service = createAdminLessonService();

    expect(service).toBeInstanceOf(AdminLessonService);
    expect((service as any).repository).toBeInstanceOf(AdminLessonRepository);
  });
});
