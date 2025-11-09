import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service';
import { BaseException, ErrorHandler, UserNotFoundException } from '@/exceptions/auth.exceptions';
import { UpdateProfileSchema } from '@/validations/profile.validation';
import cloudinary from '@/config/cloudinary';
import { Readable } from 'stream';

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

  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
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

      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only images are allowed',
        });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB',
        });
      }

      try {
        // Create a stream from buffer
        const stream = Readable.from(req.file.buffer);

        // Upload to Cloudinary via stream
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'avatars',
              resource_type: 'image',
              transformation: [
                { width: 400, height: 400, crop: 'limit' },
                { quality: 'auto' }
              ],
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                reject(new Error('Failed to upload image to cloud storage'));
              } else {
                resolve(result);
              }
            }
          );

          stream.pipe(uploadStream);
        });

        // Update user's avatar URL in database
        const updatedProfile = await this.profileService.updateProfile(userId, {
          avatar: (result as any).secure_url,
        });

        res.status(200).json({
          success: true,
          message: 'Avatar uploaded successfully',
          url: (result as any).secure_url,
          data: updatedProfile,
        });
      } catch (uploadError) {
        console.error('Upload error details:', uploadError);
        return res.status(500).json({
          success: false,
          message: uploadError instanceof Error ? uploadError.message : 'Failed to upload avatar',
        });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error during avatar upload',
      });
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

