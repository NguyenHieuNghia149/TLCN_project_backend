import { AdminUserService, createAdminUserService } from '@backend/api/services/admin/adminUser.service';
import { AdminUserRepository } from '@backend/api/repositories/admin/adminUser.repository';

describe('AdminUserService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses the injected repository to list users', async () => {
    const result = { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
    const adminUserRepository = {
      list: jest.fn().mockResolvedValue(result),
    } as any;
    const service = new AdminUserService({ adminUserRepository });

    const response = await service.listUsers({
      filters: { search: undefined },
      pagination: { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    } as any);

    expect(adminUserRepository.list).toHaveBeenCalledTimes(1);
    expect(response).toEqual(result);
  });

  it('creates a service wired with a concrete admin user repository', () => {
    const service = createAdminUserService();

    expect(service).toBeInstanceOf(AdminUserService);
    expect((service as any).repo).toBeInstanceOf(AdminUserRepository);
  });
});
