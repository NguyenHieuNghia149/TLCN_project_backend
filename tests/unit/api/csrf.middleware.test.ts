import { Request, Response } from 'express';

import { AuthController } from '@backend/api/controllers/auth.controller';
import { AuthenticationException } from '@backend/api/exceptions/auth.exceptions';
import { csrfProtection } from '@backend/api/middlewares/csrf.middleware';

function createResponse(): Response {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('csrfProtection middleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('bypasses safe methods without requiring CSRF headers', () => {
    const req = {
      method: 'GET',
      cookies: {
        accessToken: 'access-token',
        csrfToken: 'csrf-token',
      },
      headers: {},
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not block mutating requests that do not carry browser auth cookies', () => {
    const req = {
      method: 'POST',
      cookies: {},
      headers: {},
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/google',
    '/api/auth/refresh-token',
    '/api/auth/send-verification-email',
    '/api/auth/send-reset-otp',
    '/api/auth/verify-otp',
    '/api/auth/reset-password',
  ])(
    'bypasses explicit public auth/bootstrap route %s even when auth cookies remain',
    path => {
      const req = {
        method: 'POST',
        path,
        cookies: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          csrfToken: 'csrf-token',
        },
        headers: {},
      } as unknown as Request;
      const res = createResponse();
      const next = jest.fn();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    },
  );

  it('fails mutating browser-authenticated requests without the CSRF header', () => {
    const req = {
      method: 'POST',
      path: '/api/auth/logout',
      cookies: {
        accessToken: 'access-token',
        csrfToken: 'csrf-token',
      },
      headers: {},
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_MISMATCH',
    });
  });

  it('passes when the csrfToken cookie matches the X-CSRF-Token header', () => {
    const req = {
      method: 'PATCH',
      path: '/api/roadmaps',
      cookies: {
        accessToken: 'access-token',
        csrfToken: 'csrf-token',
      },
      headers: {
        'x-csrf-token': 'csrf-token',
      },
    } as unknown as Request;
    const res = createResponse();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('AuthController CSRF cookie issuance', () => {
  const originalAuthCookieSameSite = process.env.AUTH_COOKIE_SAME_SITE;

  beforeEach(() => {
    delete process.env.AUTH_COOKIE_SAME_SITE;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalAuthCookieSameSite === undefined) {
      delete process.env.AUTH_COOKIE_SAME_SITE;
      return;
    }

    process.env.AUTH_COOKIE_SAME_SITE = originalAuthCookieSameSite;
  });

  function createAuthResult() {
    return {
      user: {
        id: 'user-1',
        email: 'login@example.com',
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 60_000,
      },
    };
  }

  it('sets a readable csrfToken cookie alongside auth cookies on login', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue(createAuthResult()),
    } as any;
    const controller = new AuthController(authService, {} as any, {} as any);
    const response = createResponse();
    const req = {
      body: {
        email: 'login@example.com',
        password: 'Password#123',
      },
      cookies: {},
    } as unknown as Request;

    await controller.login(req, response, jest.fn());

    expect(response.cookie).toHaveBeenCalledWith(
      'csrfToken',
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        path: '/',
        sameSite: 'lax',
        secure: false,
      }),
    );
  });

  it('reuses an existing csrfToken cookie during refresh instead of requiring rotation', async () => {
    const authService = {
      refreshToken: jest.fn().mockResolvedValue(createAuthResult()),
    } as any;
    const controller = new AuthController(authService, {} as any, {} as any);
    const response = createResponse();
    const req = {
      cookies: {
        refreshToken: 'refresh-token',
        csrfToken: 'existing-csrf-token',
      },
    } as unknown as Request;

    await controller.refreshToken(req, response, jest.fn());

    expect(authService.refreshToken).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
    });
    expect(response.cookie).toHaveBeenCalledWith(
      'csrfToken',
      'existing-csrf-token',
      expect.objectContaining({
        httpOnly: false,
        path: '/',
        sameSite: 'lax',
        secure: false,
      }),
    );
  });

  it('clears the csrfToken cookie on logout', async () => {
    const authService = {
      logout: jest.fn().mockResolvedValue(undefined),
    } as any;
    const controller = new AuthController(authService, {} as any, {} as any);
    const response = createResponse();
    const req = {
      cookies: {
        refreshToken: 'refresh-token',
      },
    } as unknown as Request;

    await controller.logout(req, response, jest.fn());

    expect(response.clearCookie).toHaveBeenCalledWith(
      'csrfToken',
      expect.objectContaining({
        httpOnly: false,
        path: '/',
        sameSite: 'lax',
        secure: false,
      }),
    );
  });

  it('still rejects invalid refresh cookies before auth-service refresh logic runs', async () => {
    const authService = {
      refreshToken: jest.fn(),
    } as any;
    const controller = new AuthController(authService, {} as any, {} as any);
    const req = {
      cookies: {
        refreshToken: '   ',
      },
    } as unknown as Request;

    await expect(
      controller.refreshToken(req, createResponse(), jest.fn()),
    ).rejects.toBeInstanceOf(AuthenticationException);
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });
});
