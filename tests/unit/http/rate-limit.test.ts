import express from 'express';
import request from 'supertest';
import { rateLimitMiddleware } from '@backend/shared/http/rate-limit';

describe('shared rateLimitMiddleware', () => {
  const originalDisableRateLimits = process.env.DISABLE_RATE_LIMITS;

  afterEach(() => {
    if (originalDisableRateLimits === undefined) {
      delete process.env.DISABLE_RATE_LIMITS;
    } else {
      process.env.DISABLE_RATE_LIMITS = originalDisableRateLimits;
    }
  });

  it('returns an express request handler', () => {
    const limiter = rateLimitMiddleware({ windowMs: 1000, max: 1 });

    expect(typeof limiter).toBe('function');
  });

  it('rejects requests that exceed the configured threshold', async () => {
    const app = express();
    app.get('/limited', rateLimitMiddleware({ windowMs: 60000, max: 1 }), (_req, res) => {
      res.status(200).json({ success: true });
    });

    const firstResponse = await request(app).get('/limited');
    const secondResponse = await request(app).get('/limited');

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(secondResponse.body).toMatchObject({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('bypasses requests only when explicitly disabled', async () => {
    process.env.DISABLE_RATE_LIMITS = 'true';
    const app = express();
    app.get('/limited', rateLimitMiddleware({ windowMs: 60000, max: 1 }), (_req, res) => {
      res.status(200).json({ success: true });
    });

    const firstResponse = await request(app).get('/limited');
    const secondResponse = await request(app).get('/limited');

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
  });
});
