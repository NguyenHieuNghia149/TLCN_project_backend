jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
  },
}));

import { JWTUtils, PasswordUtils } from '@backend/shared/utils';
import {
  AuthService,
  createAuthService,
  IGoogleIdentityClient,
} from '@backend/api/services/auth.service';
import { EMailService, otpStore } from '@backend/api/services/email.service';
import { UserRepository } from '@backend/api/repositories/user.repository';
import { TokenRepository } from '@backend/api/repositories/token.repository';

describe('AuthService', () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    otpStore.clear();
    if (originalGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    }
  });

  it('awaits OTP verification before reading repositories during register', async () => {
    let resolveVerify!: (value: boolean) => void;
    const emailService = {
      verifyOTP: jest.fn(
        () =>
          new Promise<boolean>(resolve => {
            resolveVerify = resolve;
          }),
      ),
    } as unknown as EMailService;
    const userRepository = {
      findByEmail: jest.fn(),
      createUser: jest.fn(),
    } as any;
    const tokenRepository = {} as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService,
      googleIdentityClient: undefined,
    });

    const registerPromise = service.register({
      email: 'await-check@example.com',
      otp: '123456',
      password: 'StrongPass1!',
      passwordConfirm: 'StrongPass1!',
      firstName: 'Auth',
      lastName: 'Tester',
    } as any);

    await Promise.resolve();
    expect(userRepository.findByEmail).not.toHaveBeenCalled();

    resolveVerify(false);

    await expect(registerPromise).rejects.toThrow('Invalid or expired OTP');
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it('creates a user after OTP verification succeeds', async () => {
    jest.spyOn(PasswordUtils, 'validatePasswordStrength').mockReturnValue({
      isValid: true,
      errors: [],
    });
    jest.spyOn(PasswordUtils, 'hashPassword').mockResolvedValue('hashed-password');

    const emailService = {
      verifyOTP: jest.fn().mockResolvedValue(true),
    } as unknown as EMailService;
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      createUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'happy@example.com',
        firstName: 'Happy',
        lastName: 'Path',
        avatar: null,
        role: 'USER',
        status: 'ACTIVE',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    } as any;
    const tokenRepository = {} as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService,
      googleIdentityClient: undefined,
    });

    const result = await service.register({
      email: 'happy@example.com',
      otp: '123456',
      password: 'StrongPass1!',
      passwordConfirm: 'StrongPass1!',
      firstName: 'Happy',
      lastName: 'Path',
    } as any);

    expect(emailService.verifyOTP).toHaveBeenCalledWith('happy@example.com', '123456');
    expect(userRepository.createUser).toHaveBeenCalledTimes(1);
    expect(result.user).toMatchObject({
      id: 'user-1',
      email: 'happy@example.com',
      firstName: 'Happy',
      lastName: 'Path',
    });
  });

  it('uses the injected Google identity client for Google login', async () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    jest.spyOn(PasswordUtils, 'hashPassword').mockResolvedValue('google-password');
    jest.spyOn(JWTUtils, 'generateTokenPair').mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });

    const googleIdentityClient: IGoogleIdentityClient = {
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({
          email: 'google@example.com',
          given_name: 'Google',
          family_name: 'User',
          picture: 'avatar.png',
        }),
      }),
    };
    const emailService = {} as EMailService;
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      createUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'google@example.com',
        firstName: 'Google',
        lastName: 'User',
        avatar: 'avatar.png',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastLoginAt: null,
      }),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      getUserRank: jest.fn().mockResolvedValue({ rankingPoint: 10, rank: 2 }),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService,
      googleIdentityClient,
    });

    const result = await service.loginWithGoogle({ idToken: 'google-id-token' } as any);

    expect(googleIdentityClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'google-client-id',
    });
    expect(tokenRepository.createRefreshToken).toHaveBeenCalledTimes(1);
    expect(result.user.email).toBe('google@example.com');
  });

  it('keeps the explicit not-configured error when no Google client is injected', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const service = new AuthService({
      userRepository: {} as any,
      tokenRepository: {} as any,
      emailService: {} as any,
      googleIdentityClient: undefined,
    });

    await expect(service.loginWithGoogle({ idToken: 'google-id-token' } as any)).rejects.toThrow(
      'Google login is not configured',
    );
  });

  it('creates an auth service instance from the factory', () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const service = createAuthService();

    expect(service).toBeInstanceOf(AuthService);
    expect((service as any).userRepository).toBeInstanceOf(UserRepository);
    expect((service as any).tokenRepository).toBeInstanceOf(TokenRepository);
    expect((service as any).emailService).toBeInstanceOf(EMailService);
  });

  it('reuses a provided shared email service in the auth factory', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const sharedEmailService = { verifyOTP: jest.fn() } as unknown as EMailService;

    const service = createAuthService({ emailService: sharedEmailService });

    expect(service).toBeInstanceOf(AuthService);
    expect((service as any).emailService).toBe(sharedEmailService);
  });
});