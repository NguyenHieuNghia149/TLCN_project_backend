import {
  AdminUserRepository,
  createAdminUserRepository,
} from '@backend/api/repositories/admin/adminUser.repository';
import { UserRepository } from '@backend/api/repositories/user.repository';

describe('AdminUserRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('delegates list calls to the injected user repository', async () => {
    const result = { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
    const userRepository = {
      findUsersWithFilters: jest.fn().mockResolvedValue(result),
    } as any;
    const repository = new AdminUserRepository({ userRepository });

    const response = await repository.list(
      { search: 'alice', role: 'student' },
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    );

    expect(userRepository.findUsersWithFilters).toHaveBeenCalledWith(
      { search: 'alice', role: 'student' },
      { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
    );
    expect(response).toBe(result);
  });

  it('delegates remove calls to the injected user repository', async () => {
    const userRepository = {
      deleteUser: jest.fn().mockResolvedValue(undefined),
    } as any;
    const repository = new AdminUserRepository({ userRepository });

    await repository.remove('user-1');

    expect(userRepository.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('creates a repository wired with a concrete user repository', () => {
    const repository = createAdminUserRepository();

    expect(repository).toBeInstanceOf(AdminUserRepository);
    expect((repository as any).userRepository).toBeInstanceOf(UserRepository);
  });
});