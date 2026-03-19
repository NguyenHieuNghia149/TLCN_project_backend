import type { Request, RequestHandler, Response } from 'express';
import rateLimit, { type Store } from 'express-rate-limit';

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request, res: Response) => string | Promise<string>;
  store?: Store;
};

export function rateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    store: options.store,
    message: {
      success: false,
      message: options.message || 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    keyGenerator: options.keyGenerator,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        message: options.message || 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(options.windowMs / 1000),
      });
    },
  });
}