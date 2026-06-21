import { UserRepository } from '@backend/api/repositories/user.repository';
import { users } from '@backend/shared/db/schema';

describe('UserRepository - Ban/Unban Methods', () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function installUpdateDbMock() {
    const mockWhere = jest.fn(async () => ({ rowCount: 1 }));
    const mockSet = jest.fn(() => ({ where: mockWhere }));
    const mockUpdate = jest.fn(() => ({ set: mockSet }));
    (repository as any).db = { update: mockUpdate };
    return { mockUpdate, mockSet, mockWhere };
  }

  function installSelectWhereDbMock<T>(rows: T[]) {
    const mockWhere = jest.fn(async () => rows);
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockSelect = jest.fn(() => ({ from: mockFrom }));
    (repository as any).db = { select: mockSelect };
    return { mockSelect, mockFrom, mockWhere };
  }

  it('sets ban fields when banning a user', async () => {
    const { mockUpdate, mockSet, mockWhere } = installUpdateDbMock();

    await repository.banUser(
      'user-123',
      'Violation of community standards',
      'admin-1',
    );

    expect(mockUpdate).toHaveBeenCalledWith(users);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'banned',
        banReason: 'Violation of community standards',
        bannedByAdminId: 'admin-1',
        bannedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockWhere).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it('clears ban fields when unbanning a user', async () => {
    const { mockUpdate, mockSet, mockWhere } = installUpdateDbMock();

    await repository.unbanUser('user-456');

    expect(mockUpdate).toHaveBeenCalledWith(users);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        banReason: null,
        bannedAt: null,
        bannedByAdminId: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(mockWhere).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it('returns the count of banned users', async () => {
    installSelectWhereDbMock([{ count: 3 }]);

    await expect(repository.countBannedUsers()).resolves.toBe(3);
  });

  it('returns zero when the count query has no row', async () => {
    installSelectWhereDbMock([]);

    await expect(repository.countBannedUsers()).resolves.toBe(0);
  });

  it('returns paginated banned users without touching the real database', async () => {
    const rows = [{ id: 'user-1', status: 'banned' }];
    const mockOffset = jest.fn(async () => rows);
    const mockLimit = jest.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
    const mockWhere = jest.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockSelect = jest.fn(() => ({ from: mockFrom }));
    (repository as any).db = { select: mockSelect };

    await expect(repository.getBannedUsers(10, 5)).resolves.toEqual(rows);

    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(mockOffset).toHaveBeenCalledWith(5);
  });

  it('returns users banned by a specific admin without touching the real database', async () => {
    const rows = [{ id: 'user-2', status: 'banned', bannedByAdminId: 'admin-1' }];
    const mockLimit = jest.fn(async () => rows);
    const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
    const mockWhere = jest.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = jest.fn(() => ({ where: mockWhere }));
    const mockSelect = jest.fn(() => ({ from: mockFrom }));
    (repository as any).db = { select: mockSelect };

    await expect(repository.getUsersBannedByAdmin('admin-1', 7)).resolves.toEqual(rows);

    expect(mockLimit).toHaveBeenCalledWith(7);
  });
});
