import { AdminUserService } from '../../../apps/api/src/services/admin/adminUser.service';

describe('AdminUserService - Ban Operations', () => {
  let service: AdminUserService;
  let mockAdminUserRepository: any;

  beforeEach(() => {
    mockAdminUserRepository = {
      list: jest.fn(),
      getById: jest.fn(),
    } as any;

    service = new AdminUserService({
      adminUserRepository: mockAdminUserRepository,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('banUser', () => {
    it('should reject non-admin ban attempt', async () => {
      // Act & Assert
      await expect(
        service.banUser('user-1', 'user-2', 'USER', 'test reason')
      ).rejects.toThrow();
    });

    it('should reject ban with short reason', async () => {
      // Act & Assert  
      await expect(
        service.banUser('user-1', 'admin-1', 'ADMIN', 'short')
      ).rejects.toThrow();
    });

    it('should reject self-ban', async () => {
      // Act & Assert
      await expect(
        service.banUser('user-1', 'user-1', 'ADMIN', 'This is a long enough reason for testing')
      ).rejects.toThrow();
    });
  });

  describe('unbanUser', () => {
    it('should reject non-admin unban attempt', async () => {
      // Act & Assert
      await expect(
        service.unbanUser('user-1', 'user-2', 'USER')
      ).rejects.toThrow();
    });
  });

  describe('listBannedUsers', () => {
    it('should require admin role', async () => {
      // Act & Assert
      await expect(
        service.listBannedUsers(20, 0, 'USER')
      ).rejects.toThrow();
    });
  });
});
