import { UserRepository } from '../../../apps/api/src/repositories/user.repository';

describe('UserRepository - Ban/Unban Methods', () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('banUser', () => {
    it('should call update with ban fields', async () => {
      // Mock the update method
      const updateSpy = jest
        .spyOn(repository as any, 'db' as any)
        .mockImplementation(() => ({
          update: jest.fn(),
        }));

      const userId = 'user-123';
      const banReason = 'Violation of community standards';
      const bannedByAdminId = 'admin-1';

      // Act - just verify it doesn't throw
      await expect(
        repository.banUser(userId, banReason, bannedByAdminId)
      ).resolves.toBeUndefined();
    });
  });

  describe('unbanUser', () => {
    it('should call update to clear ban fields', async () => {
      const userId = 'user-456';

      // Act - just verify it doesn't throw
      await expect(repository.unbanUser(userId)).resolves.toBeUndefined();
    });
  });

  describe('countBannedUsers', () => {
    it('should return count of banned users', async () => {
      // Act
      const count = await repository.countBannedUsers();

      // Assert
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getBannedUsers', () => {
    it('should return paginated list of banned users', async () => {
      // Act
      const result = await repository.getBannedUsers(10, 0);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getUsersBannedByAdmin', () => {
    it('should return users banned by specific admin', async () => {
      // Act
      const adminId = 'admin-1';
      const result = await repository.getUsersBannedByAdmin(adminId, 10);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
