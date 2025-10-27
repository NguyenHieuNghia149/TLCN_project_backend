import { Router } from 'express';
import { ProfileController } from '@/controllers/profile.controller';
import { ProfileService } from '@/services/profile.service';
import { authenticationToken } from '@/middlewares/auth.middleware';
import { rateLimitMiddleware } from '@/middlewares/ratelimit.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { UpdateProfileSchema } from '@/validations/profile.validation';
import { z } from 'zod';

const router = Router();
const profileService = new ProfileService();
const profileController = new ProfileController(profileService);

const generalLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 });
const mutateLimit = rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 });

// Get current user's profile with statistics
router.get(
  '/me',
  authenticationToken,
  generalLimit,
  profileController.getProfile.bind(profileController)
);

// Get profile by user ID
router.get(
  '/:userId',
  authenticationToken,
  validate(z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }), 'params'),
  generalLimit,
  profileController.getProfileById.bind(profileController)
);

// Update current user's profile
router.put(
  '/me',
  authenticationToken,
  mutateLimit,
  validate(UpdateProfileSchema),
  profileController.updateProfile.bind(profileController)
);

// Error handler middleware
router.use(ProfileController.errorHandler);

export default router;

