import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/auth.service';
import {
  BaseException,
  ErrorHandler,
  UserAlreadyExistsException,
  UserNotFoundException,
} from '@/exceptions/auth.exceptions';
import {
  ChangePasswordInput,
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
} from '@/validations/auth.validation';
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
    // res.cookie('refreshToken', result.tokens.refreshToken, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === 'production',
    //   sameSite: 'strict',
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    //   path: '/api/auth/refresh-token',
    // });

    //const { refreshToken, ...tokensWithoutRefresh } = result.tokens;

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: result.user,
        //tokens: tokensWithoutRefresh,
      },
    });
  }

  async googleLogin(req: Request, res: Response, next: NextFunction) {
    const result = await this.authService.loginWithGoogle(req.body as GoogleLoginInput);

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh-token',
    });

    const { refreshToken, ...tokensWithoutRefresh } = result.tokens;

    res.status(200).json({
      success: true,
      message: 'Login with Google successful',
      data: {
        user: result.user,
        tokens: tokensWithoutRefresh,
      },
    });
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const result = await this.authService.login(req.body as LoginInput);

    if (!result) {
      res.status(401).json({
        success: false,
        message: 'User with this email does not exist',
      });
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
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        tokens: tokensWithoutRefresh,
      },
    });
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found',
        code: 'NO_REFRESH_TOKEN',
      });
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
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: result.user,
        tokens: tokensWithoutRefresh,
      },
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
      success: true,
      message: 'Logout successful',
    });
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    await this.authService.logoutAll(userId);

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices',
    });
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    await this.userService.changePassword(userId, req.body as ChangePasswordInput);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const profile = await this.userService.getProfile(userId);

    res.status(200).json({
      success: true,
      data: profile,
    });
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const updateData = req.body;
    const profile = await this.userService.updateProfile(userId, updateData);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: profile,
    });
  }

  async getProfileById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const profile = await this.userService.getProfile(userId);

    res.status(200).json({
      success: true,
      data: profile,
    });
  }

  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    try {
      // Upload to Cloudinary
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
        },
        async (error: any, result?: any) => {
          if (error || !result) {
            console.error('Cloudinary upload error:', error)
            return res.status(500).json({
              success: false,
              message: 'Failed to upload image',
            });
          }

          console.log('Cloudinary upload success, URL:', result.secure_url)

          try {
            // Update user profile with Cloudinary URL
            const updateData = { avatar: result.secure_url };
            const profile = await this.userService.updateProfile(userId, updateData);

            console.log('Profile updated with avatar:', profile.avatar)

            return res.status(200).json({
              success: true,
              message: 'Avatar updated successfully',
              data: profile,
            });
          } catch (error) {
            console.error('Profile update error:', error)
            return res.status(500).json({
              success: false,
              message: 'Failed to update profile',
            });
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

  // Error handling middleware
  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    // Handle Postgres unique violation for email (user already exists)
    const anyError = error as any;
    if (anyError && anyError.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        code: 'DUPLICATE_USER',
        timestamp: new Date().toISOString(),
      });
    }

    if (error instanceof BaseException) {
      const errorResponse = ErrorHandler.getErrorResponse(error);
      return res.status(errorResponse.statusCode).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: errorResponse.timestamp,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
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
      success: true,
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
      success: true,
      message: 'Reset OTP sent to your email.',
    });
  }

  async verifyOTP(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { email, otp } = req.body;

    const isValid = await this.emailService.verifyOTP(email, otp);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
    });
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const { email, otp, newPassword } = req.body;
    await this.authService.resetPassword(email, newPassword, otp);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  }
}
