import { JWTUtils, PasswordUtils, TokenUtils } from '@backend/shared/utils';
import { timeAsyncStage } from '@backend/api/services/performance-tracing';
import {
  AuthService,
  createAuthService,
  IGoogleIdentityClient,
} from '@backend/api/services/auth.service';
import { EMailService, otpStore } from '@backend/api/services/email.service';
import { UserRepository } from '@backend/api/repositories/user.repository';
import { TokenRepository } from '@backend/api/repositories/token.repository';

jest.mock('@backend/api/services/performance-tracing', () => ({
  timeAsyncStage: jest.fn((_scope: string, _stage: string, fn: () => Promise<unknown>) => fn()),
}));

function mockSessionTokenGeneration(
  accessToken: string = 'access-token',
  refreshToken: string = 'opaque-refresh-token',
): void {
  jest.spyOn(JWTUtils, 'generateAccessToken').mockReturnValue(accessToken);
  jest.spyOn(JWTUtils, 'getTokenExpiration').mockReturnValue(new Date(Date.now() + 60_000));
  jest.spyOn(TokenUtils, 'generateOpaqueRefreshToken').mockReturnValue(refreshToken);
}

function waitForLastLoginAuditTick(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('AuthService', () => {
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;

  afterEach(async () => {
    await waitForLastLoginAuditTick();
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

  it('returns a minimal user session from password login without loading rank', async () => {
    jest.spyOn(PasswordUtils, 'comparePassword').mockResolvedValue(true);
    mockSessionTokenGeneration('access-token', 'opaque-refresh-token');

    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        password: 'hashed-password',
        firstName: 'Login',
        lastName: 'User',
        avatar: null,
        role: 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
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
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    const result = await service.login({
      email: 'login@example.com',
      password: 'StrongPass1!',
      rememberMe: false,
    } as any);

    expect(userRepository.getUserRank).not.toHaveBeenCalled();
    expect(result.user).not.toHaveProperty('rank');
    expect(result.user).not.toHaveProperty('rankingPoint');
  });

  it('creates password login sessions with explicit access JWT and opaque refresh token', async () => {
    jest.spyOn(PasswordUtils, 'comparePassword').mockResolvedValue(true);
    mockSessionTokenGeneration('password-access-token', 'password-refresh-token');

    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        password: 'hashed-password',
        firstName: 'Login',
        lastName: 'User',
        avatar: null,
        role: 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    const result = await service.login({
      email: 'login@example.com',
      password: 'StrongPass1!',
      rememberMe: false,
    } as any);

    expect(JWTUtils.generateAccessToken).toHaveBeenCalledWith('user-1', 'login@example.com', 'user');
    expect(TokenUtils.generateOpaqueRefreshToken).toHaveBeenCalledTimes(1);
    expect(tokenRepository.createRefreshToken).toHaveBeenCalledWith({
      token: 'password-refresh-token',
      userId: 'user-1',
      expiresAt: expect.any(Date),
    });
    expect(result.tokens).toEqual({
      accessToken: 'password-access-token',
      refreshToken: 'password-refresh-token',
      expiresIn: expect.any(Number),
    });
  });

  it('instruments password login async stages', async () => {
    jest.spyOn(PasswordUtils, 'comparePassword').mockResolvedValue(true);
    mockSessionTokenGeneration('access-token', 'opaque-refresh-token');

    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        password: 'hashed-password',
        firstName: 'Login',
        lastName: 'User',
        avatar: null,
        role: 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    await service.login({
      email: 'login@example.com',
      password: 'StrongPass1!',
      rememberMe: false,
    } as any);
    await waitForLastLoginAuditTick();

    expect(timeAsyncStage).toHaveBeenCalledTimes(4);
    expect(timeAsyncStage).toHaveBeenNthCalledWith(
      1,
      'auth.login',
      'findByEmail',
      expect.any(Function),
    );
    expect(timeAsyncStage).toHaveBeenNthCalledWith(
      2,
      'auth.login',
      'bcrypt.compare',
      expect.any(Function),
    );
    expect(timeAsyncStage).toHaveBeenNthCalledWith(
      3,
      'auth.login',
      'createRefreshToken',
      expect.any(Function),
    );
    expect(timeAsyncStage).toHaveBeenNthCalledWith(
      4,
      'auth.login',
      'updateLastLogin',
      expect.any(Function),
    );
  });

  it('does not block password login response on last-login audit update', async () => {
    jest.spyOn(PasswordUtils, 'comparePassword').mockResolvedValue(true);
    mockSessionTokenGeneration('access-token', 'opaque-refresh-token');

    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        password: 'hashed-password',
        firstName: 'Login',
        lastName: 'User',
        avatar: null,
        role: 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
      updateLastLogin: jest.fn(
        () =>
          new Promise<void>(() => {
            // Deliberately unresolved: login should not wait for this audit update.
          }),
      ),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    const result = await Promise.race([
      service.login({
        email: 'login@example.com',
        password: 'StrongPass1!',
        rememberMe: false,
      } as any),
      new Promise(resolve => setTimeout(() => resolve('timed-out'), 25)),
    ]);

    expect(result).not.toBe('timed-out');
    expect(userRepository.updateLastLogin).not.toHaveBeenCalled();
    expect(tokenRepository.createRefreshToken).toHaveBeenCalledTimes(1);

    await waitForLastLoginAuditTick();

    expect(userRepository.updateLastLogin).toHaveBeenCalledWith('user-1');
    expect(tokenRepository.createRefreshToken).toHaveBeenCalledTimes(1);
    expect(tokenRepository.createRefreshToken.mock.invocationCallOrder[0]).toBeLessThan(
      userRepository.updateLastLogin.mock.invocationCallOrder[0],
    );
  });

  it('bounds password login last-login audit writes so they do not flood the database pool', async () => {
    jest.spyOn(PasswordUtils, 'comparePassword').mockResolvedValue(true);
    mockSessionTokenGeneration('access-token', 'opaque-refresh-token');

    const userRepository = {
      findByEmail: jest.fn(async (email: string) => {
        const userIndex = email.match(/\d+/)?.[0] ?? '1';
        return {
          id: `user-${userIndex}`,
          email,
          password: 'hashed-password',
          firstName: 'Login',
          lastName: 'User',
          avatar: null,
          role: 'user',
          status: 'active',
          lastLoginAt: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        };
      }),
      updateLastLogin: jest.fn(
        () =>
          new Promise<void>(() => {
            // Deliberately unresolved: this models a slow hosted DB audit write.
          }),
      ),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        service.login({
          email: `login${index + 1}@example.com`,
          password: 'StrongPass1!',
          rememberMe: false,
        } as any),
      ),
    );

    expect(userRepository.updateLastLogin).not.toHaveBeenCalled();

    await waitForLastLoginAuditTick();

    expect(userRepository.updateLastLogin).toHaveBeenCalledTimes(2);
  });

  it('uses the injected Google identity client for Google login', async () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    jest.spyOn(PasswordUtils, 'hashPassword').mockResolvedValue('google-password');
    mockSessionTokenGeneration('google-access-token', 'google-refresh-token');

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
    expect(userRepository.getUserRank).not.toHaveBeenCalled();
    expect(result.user).not.toHaveProperty('rank');
    expect(result.user).not.toHaveProperty('rankingPoint');
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

  it('returns a minimal user session from refresh without loading rank', async () => {
    jest.spyOn(JWTUtils, 'generateAccessToken').mockReturnValue('rotated-access-token');
    jest.spyOn(JWTUtils, 'getTokenExpiration').mockReturnValue(new Date(Date.now() + 60_000));

    const userRepository = {
      findByIdOrThrow: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'login@example.com',
        firstName: 'Login',
        lastName: 'User',
        avatar: null,
        role: 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
      getUserRank: jest.fn().mockResolvedValue({ rankingPoint: 10, rank: 2 }),
    } as any;
    const tokenRepository = {
      findByToken: jest.fn().mockResolvedValue({
        token: 'stored-refresh-token',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    const result = await service.refreshToken({ refreshToken: 'stored-refresh-token' });

    expect(userRepository.getUserRank).not.toHaveBeenCalled();
    expect(result.user).not.toHaveProperty('rank');
    expect(result.user).not.toHaveProperty('rankingPoint');
  });

  it('refreshes an access token from the stored opaque refresh token without JWT verification', async () => {
    jest.spyOn(JWTUtils, 'generateAccessToken').mockReturnValue('new-access-token');
    jest.spyOn(JWTUtils, 'getTokenExpiration').mockReturnValue(new Date(Date.now() + 60_000));

    const userRepository = {
      findByIdOrThrow: jest.fn().mockResolvedValue({
        id: 'user-from-store',
        email: 'login@example.com',
        firstName: 'Login',
        lastName: 'User',
        avatar: null,
        role: 'user',
        status: 'active',
        lastLoginAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    } as any;
    const tokenRepository = {
      findByToken: jest.fn().mockResolvedValue({
        token: 'stored-refresh-token',
        userId: 'user-from-store',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    } as any;
    const service = new AuthService({
      userRepository,
      tokenRepository,
      emailService: {} as EMailService,
      googleIdentityClient: undefined,
    });

    const result = await service.refreshToken({ refreshToken: 'stored-refresh-token' });

    expect((JWTUtils as any).verifyRefreshToken).toBeUndefined();
    expect(userRepository.findByIdOrThrow).toHaveBeenCalledWith('user-from-store');
    expect(result.tokens).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'stored-refresh-token',
      expiresIn: expect.any(Number),
    });
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
