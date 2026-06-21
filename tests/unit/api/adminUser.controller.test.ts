import AdminUserController from '@backend/api/controllers/admin/adminUser.controller';
import { createMockResponse } from './controller-test-helpers';

describe('AdminUserController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the injected admin user service to list users', async () => {
    const result = { items: [], total: 0 };
    const adminUserService = {
      listUsers: jest.fn().mockResolvedValue(result),
    } as any;
    const controller = new AdminUserController(adminUserService);
    const response = createMockResponse();

    await controller.list({ query: {} } as any, response as any);

    expect(adminUserService.listUsers).toHaveBeenCalledWith({
      filters: {
        search: undefined,
        role: undefined,
        status: undefined,
        email: undefined,
        firstName: undefined,
        lastName: undefined,
      },
      pagination: { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: result });
  });
});
