import { JWTUtils, logger, PasswordUtils, TokenUtils } from '@backend/shared/utils';
import {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  RegisterResponseSchema,
  GoogleLoginInput,
} from '@backend/shared/validations/auth.validation';
import { TokenRepository } from '../repositories/token.repository';
import { UserRepository } from '../repositories/user.repository';
import {
  UserAlreadyExistsException,
  InvalidCredentialsException,
  TokenExpiredException,
  ValidationException,
} from '../exceptions/auth.exceptions';
import { Request } from 'express';
import { EStatus } from '@backend/shared/types';
import { createEMailService, EMailService, otpStore } from './email.service';
import { EUserRole } from '@backend/shared/types';
import { OAuth2Client } from 'google-auth-library';
import { timeAsyncStage } from './performance-tracing';

export interface IGoogleIdentityClient {
  verifyIdToken(options: {
    idToken: string;
    audience?: string;
  }): Promise<{
    getPayload(): {
      email?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email_verified?: boolean;
    } | undefined;
  }>;
}

type AuthServiceDependencies = {
  userRepository: UserRepository;
  tokenRepository: TokenRepository;
  emailService: EMailService;
  googleIdentityClient?: IGoogleIdentityClient;
};

type CreateAuthServiceOptions = {
  emailService?: EMailService;
  googleIdentityClient?: IGoogleIdentityClient;
};

function readPositiveIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class AuthService {
  private userRepository: UserRepository;
  private tokenRepository: TokenRepository;
  private emailService: EMailService;
  private googleClient?: IGoogleIdentityClient;
  private pendingLastLoginAuditUserIds = new Set<string>();
  private activeLastLoginAuditCount = 0;
  private lastLoginAuditDrainScheduled = false;
  private readonly lastLoginAuditConcurrency = readPositiveIntegerEnv(
    process.env.AUTH_LAST_LOGIN_AUDIT_CONCURRENCY,
    2,
  );
  private readonly lastLoginAuditMaxPending = readPositiveIntegerEnv(
    process.env.AUTH_LAST_LOGIN_AUDIT_MAX_PENDING,
    1000,
  );

  constructor({
    userRepository,
    tokenRepository,
    emailService,
    googleIdentityClient,
  }: AuthServiceDependencies) {
    this.userRepository = userRepository;
    this.tokenRepository = tokenRepository;
    this.emailService = emailService;
    this.googleClient = googleIdentityClient;
  }

  async register(dto: RegisterInput): Promise<RegisterResponseSchema> {
    const isOTPValid = await this.emailService.verifyOTP(dto.email, dto.otp);

    if (!isOTPValid) {
      throw new ValidationException('Invalid or expired OTP');
    }

    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new UserAlreadyExistsException(`User with email ${dto.email} already exists`);
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(dto.password);
    if (!passwordValidation.isValid) {
      throw new ValidationException(passwordValidation.errors.join(', '));
    }

    if (dto.password !== dto.passwordConfirm) {
      throw new ValidationException('Password does not match');
    }

    const hashedPassword = await PasswordUtils.hashPassword(dto.password);

    const userData = {
      ...dto,
      password: hashedPassword,
      status: EStatus.ACTIVE,
    } as any;

    const user = await this.userRepository.createUser(userData);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  async login(dto: LoginInput): Promise<AuthResponse> {
    const user = await timeAsyncStage('auth.login', 'findByEmail', () =>
      this.userRepository.findByEmail(dto.email),
    );
    if (!user) {
      throw new InvalidCredentialsException('User with this email does not exist');
    }

    const isPasswordValid = await timeAsyncStage('auth.login', 'bcrypt.compare', () =>
      PasswordUtils.comparePassword(dto.password, user.password),
    );
    if (!isPasswordValid) {
      throw new InvalidCredentialsException('Invalid email or password');
    }

    if (user.status !== EStatus.ACTIVE) {
      throw new InvalidCredentialsException('Account is not active');
    }

    const accessToken = JWTUtils.generateAccessToken(user.id, user.email, user.role);
    const refreshToken = TokenUtils.generateOpaqueRefreshToken();

    await timeAsyncStage('auth.login', 'createRefreshToken', () =>
      this.tokenRepository.createRefreshToken({
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + (dto.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
      }),
    );

    this.recordLastLogin(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.getAccessTokenExpiresIn(accessToken),
      },
    };
  }

  private recordLastLogin(userId: string): void {
    if (
      !this.pendingLastLoginAuditUserIds.has(userId) &&
      this.pendingLastLoginAuditUserIds.size >= this.lastLoginAuditMaxPending
    ) {
      logger.warn('Dropping last-login audit because the audit queue is full', {
        userId,
        pending: this.pendingLastLoginAuditUserIds.size,
        maxPending: this.lastLoginAuditMaxPending,
      });
      return;
    }

    this.pendingLastLoginAuditUserIds.add(userId);
    this.scheduleLastLoginAuditDrain();
  }

  private scheduleLastLoginAuditDrain(): void {
    if (this.lastLoginAuditDrainScheduled) {
      return;
    }

    this.lastLoginAuditDrainScheduled = true;
    setImmediate(() => {
      this.lastLoginAuditDrainScheduled = false;
      this.drainLastLoginAuditQueue();
    });
  }

  private drainLastLoginAuditQueue(): void {
    while (
      this.activeLastLoginAuditCount < this.lastLoginAuditConcurrency &&
      this.pendingLastLoginAuditUserIds.size > 0
    ) {
      const userId = this.pendingLastLoginAuditUserIds.values().next().value;
      if (!userId) {
        return;
      }

      this.pendingLastLoginAuditUserIds.delete(userId);
      this.activeLastLoginAuditCount += 1;

      void timeAsyncStage('auth.login', 'updateLastLogin', () =>
        this.userRepository.updateLastLogin(userId),
      )
        .catch(error => {
          logger.warn('Failed to record last login', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          this.activeLastLoginAuditCount -= 1;

          if (this.pendingLastLoginAuditUserIds.size > 0) {
            this.scheduleLastLoginAuditDrain();
          }
        });
    }
  }

  private getAccessTokenExpiresIn(accessToken: string): number {
    const expiresAt = JWTUtils.getTokenExpiration(accessToken);
    if (!expiresAt) {
      return 15 * 60 * 1000;
    }

    return Math.max(expiresAt.getTime() - Date.now(), 0);
  }

  async loginWithGoogle(dto: GoogleLoginInput): Promise<AuthResponse> {
    if (!this.googleClient) {
      throw new ValidationException('Google login is not configured');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: dto.idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new ValidationException('Invalid Google token');
    }

    const email = payload.email;
    const firstName = (payload.given_name as string) || '';
    const lastName = (payload.family_name as string) || '';
    const avatar = (payload.picture as string) || null;

    let user = await this.userRepository.findByEmail(email);

    if (!user) {
      user = await this.userRepository.createUser({
        email,
        password: await PasswordUtils.hashPassword(
          Math.random().toString(36).slice(2) + Date.now().toString(),
        ),
        firstName,
        lastName,
        avatar,
        status: EStatus.ACTIVE,
        role: EUserRole.USER,
        rankingPoint: 0,
      } as any);
    } else if (avatar && user.avatar !== avatar) {
      await this.userRepository.updateUser(user.id, { avatar });
      user = { ...user, avatar } as any;
    }

    if (!user) {
      throw new ValidationException('Unable to create or load user');
    }

    const ensuredUser = user as NonNullable<typeof user>;
    await this.userRepository.updateLastLogin(ensuredUser.id);

    const accessToken = JWTUtils.generateAccessToken(
      ensuredUser.id,
      ensuredUser.email,
      ensuredUser.role,
    );
    const refreshToken = TokenUtils.generateOpaqueRefreshToken();

    await this.tokenRepository.createRefreshToken({
      token: refreshToken,
      userId: ensuredUser.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return {
      user: {
        id: ensuredUser.id,
        email: ensuredUser.email,
        firstName: ensuredUser.firstName,
        lastName: ensuredUser.lastName,
        avatar: ensuredUser.avatar,
        role: ensuredUser.role,
        status: ensuredUser.status,
        createdAt: ensuredUser.createdAt.toISOString(),
        lastLoginAt: ensuredUser.lastLoginAt ? ensuredUser.lastLoginAt.toISOString() : null,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.getAccessTokenExpiresIn(accessToken),
      },
    };
  }

  async refreshToken(dto: RefreshTokenInput): Promise<AuthResponse> {
    const storedToken = await this.tokenRepository.findByToken(dto.refreshToken);
    if (!storedToken) {
      throw new TokenExpiredException('Refresh token not found or revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.tokenRepository.revokeToken(dto.refreshToken);
      throw new TokenExpiredException('Refresh token expired');
    }

    const user = await this.userRepository.findByIdOrThrow(storedToken.userId);
    if (user.status !== EStatus.ACTIVE) {
      throw new InvalidCredentialsException('Account is not active');
    }

    const accessToken = JWTUtils.generateAccessToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken,
        refreshToken: dto.refreshToken,
        expiresIn: this.getAccessTokenExpiresIn(accessToken),
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenRepository.revokeToken(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenRepository.revokeAllUserTokens(userId);
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.tokenRepository.cleanupExpiredTokens();
  }

  async resetPassword(email: string, newPassword: string, otp: string): Promise<void> {
    const isOTPValid = await this.emailService.verifyOTP(email, otp!);
    if (!isOTPValid) {
      throw new ValidationException('Invalid or expired OTP');
    }

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new InvalidCredentialsException("User with this email doesn't exist");
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);

    if (!passwordValidation.isValid) {
      throw new ValidationException(passwordValidation.errors.join(', '));
    }

    const hashedPassword = await PasswordUtils.hashPassword(newPassword);
    await this.userRepository.updatePassword(user.id, hashedPassword);
    otpStore.delete(email);
    await this.tokenRepository.revokeAllUserTokens(user.id);
  }

  // [CRITICAL FIX] Validate token and check ban status separately
  async validateToken(token: string): Promise<{ userId: string; email: string; role: string }> {
    let decoded;

    // Try to verify JWT token first
    try {
      decoded = JWTUtils.verifyAccessToken(token);
    } catch (error) {
      throw new InvalidCredentialsException('Invalid token');
    }

    // Get user from database
    const user = await this.userRepository.findById(decoded.userId);

    if (!user) {
      throw new InvalidCredentialsException('User not found');
    }

    // [CRITICAL] Check ban status SEPARATELY and throw ValidationException
    // NOT InvalidCredentialsException — this allows client to distinguish:
    // - 401 = Token invalid or user doesn't exist (authentication error)
    // - 403 = User exists but account suspended (authorization error)
    if (user.status === 'banned') {
      throw new ValidationException(
        'Your account has been suspended. Please contact support for more information.'
      );
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role ?? EUserRole.USER,
    };
  }
}

/** Creates an AuthService with concrete repositories and optional shared auth dependencies. */
export function createAuthService(options: CreateAuthServiceOptions = {}): AuthService {
  const emailService = options.emailService ?? createEMailService();
  const googleIdentityClient = options.googleIdentityClient ??
    (process.env.GOOGLE_CLIENT_ID
      ? (new OAuth2Client(process.env.GOOGLE_CLIENT_ID) as IGoogleIdentityClient)
      : undefined);

  return new AuthService({
    userRepository: new UserRepository(),
    tokenRepository: new TokenRepository(),
    emailService,
    googleIdentityClient,
  });
}
