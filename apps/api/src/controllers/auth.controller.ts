import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/auth.service';
import {
  UserAlreadyExistsException,
  UserNotFoundException,
  AuthenticationException,
} from '@/exceptions/auth.exceptions';
import {
  ChangePasswordInput,
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
} from '@backend/shared/validations/auth.validation';
import { UserService } from '@/services/user.service';
import { EMailService } from '@/services/email.service';
import cloudinary from '@/config/cloudinary';
import { Readable } from 'stream';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly emailService: EMailService
  ) {}

  async register(req: Request, res: Response, next: NextFunction) {
    const result = await this.authService.register(req.body as RegisterInput);
    res.status(201).json({
      message: 'User registered successfully.',
      user: result.user,
    });
  }

  async googleLogin(req: Request, res: Response, next: NextFunction) {
    const result = await this.authService.loginWithGoogle(req.body as GoogleLoginInput);

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh-token',
    });

    const { refreshToken, ...tokensWithoutRefresh } = result.tokens;

    res.status(200).json({
      message: 'Login with Google successful',
      user: result.user,
      tokens: tokensWithoutRefresh,
    });
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const result = await this.authService.login(req.body as LoginInput);

    if (!result) {
      throw new AuthenticationException('User with this email does not exist');
    }

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh-token',
    });

    const { refreshToken, ...tokensWithoutRefresh } = result.tokens;

    res.status(200).json({
      message: 'Login successful',
      user: result.user,
      tokens: tokensWithoutRefresh,
    });
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      throw new AuthenticationException('Refresh token not found');
    }

    const result = await this.authService.refreshToken({ refreshToken });

    // Set rotated refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh-token',
    });

    // Return only access token to client
    const { refreshToken: _rt, ...tokensWithoutRefresh } = result.tokens as any;

    res.status(200).json({
      message: 'Token refreshed successfully',
      user: result.user,
      tokens: tokensWithoutRefresh,
    });
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    // Get refresh token from cookie
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      path: '/api/auth/refresh-token',
    });

    res.status(200).json({
      message: 'Logout successful',
    });
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AuthenticationException('User not authenticated');
    }

    await this.authService.logoutAll(userId);

    res.status(200).json({
      message: 'Logged out from all devices',
    });
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AuthenticationException('User not authenticated');
    }

    await this.userService.changePassword(userId, req.body as ChangePasswordInput);

    res.status(200).json({
      message: 'Password changed successfully',
    });
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AuthenticationException('User not authenticated');
    }

    const profile = await this.userService.getProfile(userId);

    res.status(200).json(profile);
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new AuthenticationException('User not authenticated');
    }

    const updateData = req.body;
    const profile = await this.userService.updateProfile(userId, updateData);

    res.status(200).json({
      message: 'Profile updated successfully',
      user: profile,
    });
  }

  async getProfileById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { userId } = req.params as { userId: string };

    if (!userId) {
      throw new UserNotFoundException('User ID is required');
    }

    const profile = await this.userService.getProfile(userId);

    res.status(200).json(profile);
  }

  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    if (!userId) {
      throw new AuthenticationException('User not authenticated');
    }

    if (!req.file) {
      throw new UserNotFoundException('No file uploaded');
    }

    try {
      // Upload to Cloudinary
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
        },
        async (error: any, result?: any) => {
          if (error || !result) {
            return next(new Error('Failed to upload image'));
          }

          try {
            // Update user profile with Cloudinary URL
            const updateData = { avatar: result.secure_url };
            const profile = await this.userService.updateProfile(userId, updateData);

            return res.status(200).json({
              message: 'Avatar updated successfully',
              user: profile,
            });
          } catch (error) {
            next(error);
          }
        }
      );

      // Convert buffer to stream and pipe to Cloudinary
      const fileBuffer = req.file.buffer;
      const readableStream = new Readable();
      readableStream.push(fileBuffer);
      readableStream.push(null);
      readableStream.pipe(stream);
    } catch (error) {
      next(error);
    }
  }

  async sendVerificationCode(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    const { email } = req.body;

    const user = await this.userService.findUserByEmail(email);

    if (user) {
      throw new UserAlreadyExistsException('User with this email already exists');
    }

    await this.emailService.sendVerificationCode(email);

    res.status(200).json({
      message: 'Verification code sent to your email.',
    });
  }

  async sendResetOTP(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { email } = req.body;

    const user = await this.userService.findUserByEmail(email);

    if (!user) {
      throw new UserNotFoundException('User with this email does not exist');
    }

    await this.emailService.sendVerificationCode(email);

    res.status(200).json({
      message: 'Reset OTP sent to your email.',
    });
  }

  async verifyOTP(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { email, otp } = req.body;

    const isValid = await this.emailService.verifyOTP(email, otp);

    if (!isValid) {
      throw new AuthenticationException('Invalid OTP');
    }

    res.status(200).json({
      message: 'OTP verified successfully',
    });
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { email, otp, newPassword } = req.body;
    await this.authService.resetPassword(email, newPassword, otp);

    res.status(200).json({
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  }
}
