import { Request, Response } from 'express';

import {
  AuthenticatedRequest,
  authenticationToken,
  optionalAuth,
} from '@backend/api/middlewares/auth.middleware';
import { JWTUtils } from '@backend/shared/utils';

const originalAuthCookieMigrationAllowBearerFallback =
  process.env.AUTH_COOKIE_MIGRATION_ALLOW_BEARER_FALLBACK;

function createResponse(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function createNext() {
  return jest.fn();
}

function createAccessToken(userId: string, role: string = 'user') {
  return JWTUtils.generateAccessToken(userId, `${userId}@example.com`, role);
}

describe('auth middleware cookie-first behavior', () => {
  beforeEach(() => {
    delete process.env.AUTH_COOKIE_MIGRATION_ALLOW_BEARER_FALLBACK;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalAuthCookieMigrationAllowBearerFallback === undefined) {
      delete process.env.AUTH_COOKIE_MIGRATION_ALLOW_BEARER_FALLBACK;
      return;
    }

    process.env.AUTH_COOKIE_MIGRATION_ALLOW_BEARER_FALLBACK =
      originalAuthCookieMigrationAllowBearerFallback;
  });

  it('authenticates using req.cookies.accessToken', () => {
    const req = {
      cookies: {
        accessToken: createAccessToken('cookie-user'),
      },
      headers: {},
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    authenticationToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: 'cookie-user',
      email: 'cookie-user@example.com',
      role: 'user',
    });
  });

  it('prefers the access-token cookie over the bearer fallback when both are present', () => {
    const req = {
      cookies: {
        accessToken: createAccessToken('cookie-user'),
      },
      headers: {
        authorization: `Bearer ${createAccessToken('header-user', 'teacher')}`,
      },
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    authenticationToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: 'cookie-user',
      role: 'user',
    });
  });

  it('rejects bearer auth by default when the access cookie is absent', () => {
    const req = {
      cookies: {},
      headers: {
        authorization: `Bearer ${createAccessToken('header-user', 'teacher')}`,
      },
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    authenticationToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No token provided',
      code: 'NO_TOKEN',
    });
  });

  it('keeps bearer fallback working only when the migration flag is enabled', () => {
    process.env.AUTH_COOKIE_MIGRATION_ALLOW_BEARER_FALLBACK = 'true';

    const req = {
      cookies: {},
      headers: {
        authorization: `Bearer ${createAccessToken('header-user', 'teacher')}`,
      },
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    authenticationToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: 'header-user',
      role: 'teacher',
    });
  });

  it('does not accept query-token auth when cookie and bearer auth are absent', () => {
    const req = {
      cookies: {},
      headers: {},
      query: {
        token: createAccessToken('query-user'),
      },
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    authenticationToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No token provided',
      code: 'NO_TOKEN',
    });
  });

  it('optionalAuth reads the access-token cookie without forcing a 401', () => {
    const req = {
      cookies: {
        accessToken: createAccessToken('cookie-user'),
      },
      headers: {},
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: 'cookie-user',
      email: 'cookie-user@example.com',
    });
  });

  it('optionalAuth does not use the temporary bearer fallback path', () => {
    const req = {
      cookies: {},
      headers: {
        authorization: `Bearer ${createAccessToken('header-user', 'teacher')}`,
      },
    } as unknown as AuthenticatedRequest;
    const res = createResponse();
    const next = createNext();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });
});
