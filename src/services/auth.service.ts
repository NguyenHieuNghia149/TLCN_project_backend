import {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  RegisterResponseSchema,
} from '@/validations/auth.validation';
import { TokenRepository } from '@/repositories/token.repository';
import { UserRepository } from '@/repositories/user.repository';
import { JWTUtils } from '@/utils/jwt';
import { PasswordUtils } from '@/utils/security';
import {
  UserAlreadyExistsException,
  InvalidCredentialsException,
  TokenExpiredException,
  ValidationException,
} from '@/exceptions/auth.exceptions';
import { Request } from 'express';
import { EStatus } from '@/enums/EStatus';
import { EMailService, otpStore } from './email.service';

export class AuthService {
  private userRepository: UserRepository;
  private tokenRepository: TokenRepository;
  private emailService: EMailService;
  constructor() {
    this.userRepository = new UserRepository();
    this.tokenRepository = new TokenRepository();
    this.emailService = new EMailService();
  }

  async register(dto: RegisterInput): Promise<RegisterResponseSchema> {
    const isOTPValid = this.emailService.verifyOTP(dto.email, dto.otp);

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
      // tokens: {
      //   accessToken: tokens.accessToken,
      //   refreshToken: tokens.refreshToken,
      //   expiresIn: tokens.expiresIn,
      // },
    };
  }

  async login(dto: LoginInput): Promise<AuthResponse> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new InvalidCredentialsException('User with this email does not exist');
    }

    // Verify password
    const isPasswordValid = await PasswordUtils.comparePassword(dto.password, user.password);
    if (!isPasswordValid) {
      throw new InvalidCredentialsException('Invalid email or password');
    }

    // Check if account is active
    if (user.status !== EStatus.ACTIVE) {
      throw new InvalidCredentialsException('Account is not active');
    }

    await this.userRepository.updateLastLogin(user.id);

    // Generate tokens (no sessionId)
    const tokens = JWTUtils.generateTokenPair(user.id, user.email, user.role);

    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + (dto.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
    });

    // get rank info
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

  // Removed session-based revoke

  async cleanupExpiredTokens(): Promise<void> {
    await this.tokenRepository.cleanupExpiredTokens();
  }

  // async sendVerificationCode(email: string, req: Request): Promise<void> {
  //   const rateLimitKey = `sendVeriCode:${req.ip}`;
  //   const rateLimit = RateLimitUtils.checkRateLimit(rateLimitKey, 20, 15 * 60 * 1000);
  //   if (!rateLimit.allowed) {
  //     throw new RateLimitExceededException();
  //   }

  //   const user = await this.userRepository.findByEmail(email);

  //   if (!user) {
  //     throw new InvalidCredentialsException("User with this email doesn't exist");
  //   }

  //   const otp = Math.floor(100000 + Math.random() * 900000).toString();

  //   otpStore.set(email, {
  //     otp,
  //     expires: new Date(Date.now() + 10 * 60 * 1000),
  //     userData: { email },
  //   });

  //   await transporter.sendMail({
  //     from: process.env.EMAIL,
  //     to: email,
  //     subject: 'Your Verification Code',
  //     text: `Your verification code is ${otp}. It will expire in 10 minutes.`,
  //   });
  // }

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
