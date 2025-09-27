import {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
} from '@/validations/auth.validation';
import { TokenRepository } from '@/repositories/token.repository';
import { UserRepository } from '@/repositories/user.repository';
import { JWTUtils } from '@/utils/jwt';
import { PasswordUtils, RateLimitUtils } from '@/utils/security';
import {
  UserAlreadyExistsException,
  InvalidCredentialsException,
  RateLimitExceededException,
  TokenExpiredException,
  ValidationException,
} from '@/exceptions/auth.exceptions';
import { Request } from 'express';

export class AuthService {
  private userRepository: UserRepository;
  private tokenRepository: TokenRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.tokenRepository = new TokenRepository();
  }

  async register(dto: RegisterInput, req: Request): Promise<AuthResponse> {
    const rateLimitKey = `register:${req.ip}`;
    const rateLimit = RateLimitUtils.checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      throw new RateLimitExceededException();
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(dto.password);
    if (!passwordValidation.isValid) {
      throw new ValidationException(passwordValidation.errors.join(', '));
    }

    const hashedPassword = await PasswordUtils.hashPassword(dto.password);

    const userData = {
      ...dto,
      password: hashedPassword,
      status: 'active',
    } as any;

    const user = await this.userRepository.createUser(userData);

    const tokens = JWTUtils.generateTokenPair(user.id, user.email, user.role);

    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

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
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    };
  }

  async login(dto: LoginInput, req: Request): Promise<AuthResponse> {
    const rateLimitKey = `login:${req.ip}`;
    const rateLimit = RateLimitUtils.checkRateLimit(rateLimitKey, 10, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      throw new RateLimitExceededException();
    }

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new InvalidCredentialsException();
    }

    // Verify password
    const isPasswordValid = await PasswordUtils.comparePassword(dto.password, user.password);
    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Check if account is active
    if (user.status !== 'active') {
      throw new InvalidCredentialsException('Account is not active');
    }

    await this.userRepository.updateLastLogin(user.id);

    // Generate tokens
    const tokens = JWTUtils.generateTokenPair(user.id, user.email, user.role);

    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + (dto.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
    });

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
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    };
  }

  async refreshToken(dto: RefreshTokenInput, req: Request): Promise<AuthResponse> {
    const rateLimitKey = `refresh:${req.ip}`;
    const rateLimit = RateLimitUtils.checkRateLimit(rateLimitKey, 20, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      throw new RateLimitExceededException();
    }

    let payload;
    try {
      payload = JWTUtils.verifyRefreshToken(dto.refreshToken);
    } catch (error) {
      throw new TokenExpiredException();
    }

    const refreshToken = await this.tokenRepository.findByToken(dto.refreshToken);
    if (!refreshToken) {
      throw new TokenExpiredException();
    }

    if (refreshToken.expiresAt < new Date()) {
      await this.tokenRepository.revokeToken(dto.refreshToken);
      throw new TokenExpiredException();
    }

    const user = await this.userRepository.findByIdOrThrow(payload.userId);

    if (user.status !== 'active') {
      throw new InvalidCredentialsException('Account is not active');
    }

    await this.tokenRepository.updateLastUsed(dto.refreshToken);

    const tokens = JWTUtils.generateTokenPair(user.id, user.email, user.role);

    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await this.tokenRepository.revokeToken(dto.refreshToken);

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
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenRepository.revokeToken(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenRepository.revokeAllUserTokens(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordInput): Promise<void> {
    const passwordValidation = PasswordUtils.validatePasswordStrength(dto.newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationException(passwordValidation.errors.join(', '));
    }

    const user = await this.userRepository.findByIdOrThrow(userId);

    const isCurrentPasswordValid = await PasswordUtils.comparePassword(
      dto.currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      throw new InvalidCredentialsException('Current password is incorrect');
    }

    const hashedPassword = await PasswordUtils.hashPassword(dto.newPassword);
    await this.userRepository.updatePassword(userId, hashedPassword);
    await this.tokenRepository.revokeAllUserTokens(userId);
  }

  // forgotPassword/resetPassword/verifyEmail/resendVerification removed per requirements

  async getProfile(userId: string) {
    const user = await this.userRepository.findByIdOrThrow(userId);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateProfile(
    userId: string,
    updateData: {
      firstName?: string;
      lastName?: string;
      gender?: string;
      dateOfBirth?: Date;
      avatar?: string;
    }
  ) {
    const user = await this.userRepository.updateUser(userId, updateData);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt,
    };
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.tokenRepository.cleanupExpiredTokens();
  }
}
