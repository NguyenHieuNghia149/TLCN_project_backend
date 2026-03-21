import AdminTeacherController from '@backend/api/controllers/admin/adminTeacher.controller';
import { createMockResponse } from './controller-test-helpers';

describe('AdminTeacherController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected admin user service to list teachers', async () => {
    const result = { items: [{ id: 'teacher-1' }], total: 1 };
    const adminUserService = {
      listTeachers: jest.fn().mockResolvedValue(result),
    } as any;
    const controller = new AdminTeacherController(adminUserService);
    const response = createMockResponse();

    await controller.list({ query: {} } as any, response as any);

    expect(adminUserService.listTeachers).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(result);
  });
});
