const mockUserRepository = {
  findById: jest.fn(),
  banUser: jest.fn(),
  unbanUser: jest.fn(),
  getBannedUsers: jest.fn(),
  countBannedUsers: jest.fn(),
};

const mockEmailService = {
  sendBanNotification: jest.fn(),
  sendUnbanNotification: jest.fn(),
};

jest.mock('@backend/api/repositories/user.repository', () => ({
  UserRepository: jest.fn(() => mockUserRepository),
}));

jest.mock('@backend/api/services/email.service', () => ({
  EMailService: jest.fn(),
  createEMailService: jest.fn(() => mockEmailService),
}));

import { AdminUserService } from '@backend/api/services/admin/adminUser.service';

describe('AdminUserService - Ban Operations', () => {
  let service: AdminUserService;
  let mockAdminUserRepository: any;

  beforeEach(() => {
    mockAdminUserRepository = {
      list: jest.fn(),
      getById: jest.fn(),
    };

    service = new AdminUserService({
      adminUserRepository: mockAdminUserRepository,
      userRepository: mockUserRepository as any,
      emailService: mockEmailService as any,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('banUser', () => {
    it('rejects non-admin ban attempts', async () => {
      await expect(
        service.banUser('user-1', 'user-2', 'USER', 'test reason'),
      ).rejects.toThrow('Only admins can ban users');

      expect(mockUserRepository.findById).not.toHaveBeenCalled();
    });

    it('rejects ban requests with a short reason', async () => {
      await expect(
        service.banUser('user-1', 'admin-1', 'ADMIN', 'short'),
      ).rejects.toThrow('Ban reason must be at least 10 characters');

      expect(mockUserRepository.findById).not.toHaveBeenCalled();
    });

    it('rejects self-ban after resolving the target user', async () => {
      mockUserRepository.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Self',
        lastName: 'Ban',
        role: 'USER',
        status: 'active',
      });

      await expect(
        service.banUser(
          'user-1',
          'user-1',
          'ADMIN',
          'This is a long enough reason for testing',
        ),
      ).rejects.toThrow('Cannot ban yourself');
    });
  });

  describe('unbanUser', () => {
    it('rejects non-admin unban attempts', async () => {
      await expect(
        service.unbanUser('user-1', 'user-2', 'USER'),
      ).rejects.toThrow('Only admins can unban users');

      expect(mockUserRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('listBannedUsers', () => {
    it('requires an admin role', async () => {
      await expect(
        service.listBannedUsers(20, 0, 'USER'),
      ).rejects.toThrow('Only admins can view banned users');

      expect(mockUserRepository.getBannedUsers).not.toHaveBeenCalled();
    });
  });
});
