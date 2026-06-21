const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@backend/shared/utils', () => ({
  logger,
}));

import { z } from 'zod';

import { validate } from '../../../apps/api/src/middlewares/validate.middleware';

describe('validate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not log successful request bodies that may contain sensitive data', () => {
    const middleware = validate(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }),
    );

    const req = {
      body: {
        email: 'user@example.com',
        password: 'super-secret',
      },
    } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs sanitized validation metadata without leaking request bodies on failure', () => {
    const middleware = validate(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      }),
    );

    const req = {
      body: {
        email: 'not-an-email',
        password: 'short',
      },
    } as any;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Request validation failed', {
      segment: 'body',
      issues: [
        {
          path: 'email',
          code: 'invalid_format',
          message: 'Invalid email address',
        },
        {
          path: 'password',
          code: 'too_small',
          message: 'Too small: expected string to have >=8 characters',
        },
      ],
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('super-secret');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('not-an-email');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('short');
  });
});
