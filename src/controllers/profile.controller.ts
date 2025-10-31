import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service';
import { BaseException, ErrorHandler, UserNotFoundException } from '@/exceptions/auth.exceptions';
import { UpdateProfileSchema } from '@/validations/profile.validation';

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
      }

      const profile = await this.profileService.getProfileWithStatistics(userId);
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  async getProfileById(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const profile = await this.profileService.getProfileWithStatistics(userId);
      res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
      }

      const updateData = UpdateProfileSchema.parse(req.body);
      const profile = await this.profileService.updateProfile(userId, updateData);
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  static errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void | Response {
    if (error instanceof BaseException) {
      const er = ErrorHandler.getErrorResponse(error);
      return res
        .status(er.statusCode)
        .json({
          success: false,
          message: er.message,
          code: er.code,
          timestamp: er.timestamp,
        });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
}

export default ProfileController;

