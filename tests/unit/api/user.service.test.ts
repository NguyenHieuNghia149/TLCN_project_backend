import { PasswordUtils } from '@backend/shared/utils';
import { UserService, createUserService } from '@backend/api/services/user.service';
import { UserRepository } from '@backend/api/repositories/user.repository';
import { TokenRepository } from '@backend/api/repositories/token.repository';

describe('UserService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('uses injected repositories when changing a password', async () => {
    jest.spyOn(PasswordUtils, 'validatePasswordStrength').mockReturnValue({
      isValid: true,
      errors: [],
    });
    jest.spyOn(PasswordUtils, 'comparePassword').mockResolvedValue(true);
    jest.spyOn(PasswordUtils, 'hashPassword').mockResolvedValue('hashed-password');

    const userRepository = {
      findByIdOrThrow: jest.fn().mockResolvedValue({ password: 'old-password' }),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tokenRepository = {
      revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new UserService({ userRepository, tokenRepository });

    await service.changePassword('user-1', {
      currentPassword: 'old-password',
      newPassword: 'StrongPass1!',
    } as any);

    expect(userRepository.findByIdOrThrow).toHaveBeenCalledWith('user-1');
    expect(userRepository.updatePassword).toHaveBeenCalledWith('user-1', 'hashed-password');
    expect(tokenRepository.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
  });

  it('uses injected repositories to fetch a profile', async () => {
    const userRepository = {
      findByIdOrThrow: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'profile@example.com',
        firstName: 'Profile',
        lastName: 'User',
        avatar: null,
        gender: 'other',
        dateOfBirth: null,
        role: 'USER',
        status: 'ACTIVE',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      }),
      getUserStatistics: jest.fn().mockResolvedValue({ solved: 10 }),
      getUserRank: jest.fn().mockResolvedValue({ rank: 5, rankingPoint: 120 }),
    } as any;
    const tokenRepository = {} as any;
    const service = new UserService({ userRepository, tokenRepository });

    const result = await service.getProfile('user-1');

    expect(userRepository.findByIdOrThrow).toHaveBeenCalledWith('user-1');
    expect(userRepository.getUserStatistics).toHaveBeenCalledWith('user-1');
    expect(userRepository.getUserRank).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'profile@example.com',
      rank: 5,
      rankingPoint: 120,
      statistics: { solved: 10 },
    });
  });

  it('creates a user service wired with concrete repositories', () => {
    const service = createUserService();

    expect(service).toBeInstanceOf(UserService);
    expect((service as any).userRepository).toBeInstanceOf(UserRepository);
    expect((service as any).tokenRepository).toBeInstanceOf(TokenRepository);
  });
});