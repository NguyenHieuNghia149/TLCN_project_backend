import { JWTUtils, PasswordUtils } from '@backend/shared/utils';
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

export class AuthService {
  private userRepository: UserRepository;
  private tokenRepository: TokenRepository;
  private emailService: EMailService;
  private googleClient?: IGoogleIdentityClient;

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
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new InvalidCredentialsException('User with this email does not exist');
    }

    const isPasswordValid = await PasswordUtils.comparePassword(dto.password, user.password);
    if (!isPasswordValid) {
      throw new InvalidCredentialsException('Invalid email or password');
    }

    if (user.status !== EStatus.ACTIVE) {
      throw new InvalidCredentialsException('Account is not active');
    }

    await this.userRepository.updateLastLogin(user.id);

    const tokens = JWTUtils.generateTokenPair(user.id, user.email, user.role);

    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + (dto.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
    });

    const { rankingPoint, rank } = await this.userRepository.getUserRank(user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        rankingPoint: rankingPoint ?? null,
        rank,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    };
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

    const tokens = JWTUtils.generateTokenPair(ensuredUser.id, ensuredUser.email, ensuredUser.role);
    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: ensuredUser.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const { rankingPoint, rank } = await this.userRepository.getUserRank(ensuredUser.id);

    return {
      user: {
        id: ensuredUser.id,
        email: ensuredUser.email,
        firstName: ensuredUser.firstName,
        lastName: ensuredUser.lastName,
        avatar: ensuredUser.avatar,
        role: ensuredUser.role,
        rankingPoint,
        rank,
        status: ensuredUser.status,
        createdAt: ensuredUser.createdAt.toISOString(),
        lastLoginAt: ensuredUser.lastLoginAt ? ensuredUser.lastLoginAt.toISOString() : null,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    };
  }

  async refreshToken(dto: RefreshTokenInput): Promise<AuthResponse> {
    const payload = JWTUtils.verifyRefreshToken(dto.refreshToken);

    const storedToken = await this.tokenRepository.findByToken(dto.refreshToken);
    if (!storedToken) {
      throw new TokenExpiredException('Refresh token not found or revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.tokenRepository.revokeToken(dto.refreshToken);
      throw new TokenExpiredException('Refresh token expired');
    }

    const user = await this.userRepository.findByIdOrThrow(payload.userId);
    if (user.status !== EStatus.ACTIVE) {
      throw new InvalidCredentialsException('Account is not active');
    }

    const rotated = JWTUtils.generateTokenPair(user.id, user.email, user.role);

    const { rankingPoint, rank } = await this.userRepository.getUserRank(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        rankingPoint: rankingPoint ?? null,
        rank,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
        expiresIn: rotated.expiresIn,
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