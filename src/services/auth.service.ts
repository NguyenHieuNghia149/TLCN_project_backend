import {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RefreshTokenInput,
  RegisterInput,
  RegisterResponseSchema,
  GoogleLoginInput,
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
import { EStatus } from '@/enums/userStatus.enum';
import { EMailService, otpStore } from './email.service';
import { EUserRole } from '@/enums/userRole.enum';
import { OAuth2Client } from 'google-auth-library';

export class AuthService {
  private userRepository: UserRepository;
  private tokenRepository: TokenRepository;
  private emailService: EMailService;
  private googleClient?: OAuth2Client;
  constructor() {
    this.userRepository = new UserRepository();
    this.tokenRepository = new TokenRepository();
    this.emailService = new EMailService();
    if (process.env.GOOGLE_CLIENT_ID) {
      this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }
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
    // const emailVerified = payload.email_verified;
    // if (!emailVerified) {
    //   throw new ValidationException('Google account email is not verified');
    // }

    const firstName = (payload.given_name as string) || '';
    const lastName = (payload.family_name as string) || '';
    const avatar = (payload.picture as string) || null;

    let user = await this.userRepository.findByEmail(email);

    if (!user) {
      user = await this.userRepository.createUser({
        email,
        password: await PasswordUtils.hashPassword(
          Math.random().toString(36).slice(2) + Date.now().toString()
        ),
        firstName,
        lastName,
        avatar,
        status: EStatus.ACTIVE,
        role: EUserRole.USER,
        rankingPoint: 0,
      } as any);
    } else {
      if (avatar && user.avatar !== avatar) {
        await this.userRepository.updateUser(user.id, { avatar });
        user = { ...user, avatar } as any;
      }
    }

    if (!user) {
      throw new ValidationException('Unable to create or load user');
    }

    const u = user as NonNullable<typeof user>;
    await this.userRepository.updateLastLogin(u.id);

    const tokens = JWTUtils.generateTokenPair(u.id, u.email, u.role);
    await this.tokenRepository.createRefreshToken({
      token: tokens.refreshToken,
      userId: u.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const { rankingPoint, rank } = await this.userRepository.getUserRank(u.id);

    return {
      user: {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        avatar: u.avatar,
        role: u.role,
        rankingPoint: rankingPoint,
        rank: rank,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
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
