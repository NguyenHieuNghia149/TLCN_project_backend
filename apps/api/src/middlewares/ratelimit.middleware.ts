import { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { rateLimitMiddleware } from '@backend/shared/http/rate-limit';

export const authLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Reduced from 200 to 20 to protect against brute force login/register
  message: 'Too many authentication attempts, please try again later.',
});

export const refreshLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Reduced from 1000 to 50 for token refresh
  message: 'Too many refresh attempts, please try again later.',
});

export const generalLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
});

export const strictLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500,
  message: 'Too many attempts from this IP, please try again later.',
});

export const passwordResetLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many password reset attempts, please try again later.',
});

export const emailVerificationLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many email verification requests, please try again later.',
});

export const userSpecificLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  keyGenerator: (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip ?? '');
  },
  message: 'Too many requests from this user, please try again later.',
});

export { rateLimitMiddleware };