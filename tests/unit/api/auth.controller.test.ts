import { Request, Response } from 'express';
import { AuthController } from '@backend/api/controllers/auth.controller';
import { AuthenticationException } from '@backend/api/exceptions/auth.exceptions';

function createResponse(): Response {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function createAuthResult() {
  return {
    user: {
      id: 'user-1',
      email: 'login@example.com',
      firstName: 'Login',
      lastName: 'User',
      avatar: null,
      role: 'user',
      status: 'active',
      lastLoginAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    tokens: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 60_000,
    },
  };
}

describe('AuthController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sets both auth cookies on login and omits tokens from the JSON body', async () => {
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
    } as unknown as Request;

    await controller.login(req, response, jest.fn());

    expect(response.cookie).toHaveBeenCalledWith(
      'accessToken',
      'access-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api',
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/auth',
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      message: 'Login successful',
      user: createAuthResult().user,
    });
  });

  it('sets both auth cookies on Google login and omits tokens from the JSON body', async () => {
    const authService = {
      loginWithGoogle: jest.fn().mockResolvedValue(createAuthResult()),
    } as any;
    const controller = new AuthController(authService, {} as any, {} as any);
    const response = createResponse();
    const req = {
      body: {
        credential: 'google-credential',
      },
    } as unknown as Request;

    await controller.googleLogin(req, response, jest.fn());

    expect(response.cookie).toHaveBeenCalledWith(
      'accessToken',
      'access-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api',
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/auth',
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      message: 'Login with Google successful',
      user: createAuthResult().user,
    });
  });

  it.each([undefined, null, '', '   ', 123, ['refresh-token']])(
    'rejects invalid refresh cookie value before calling the service: %p',
    async value => {
      const authService = {
        refreshToken: jest.fn(),
      } as any;
      const controller = new AuthController(authService, {} as any, {} as any);
      const req = {
        cookies: {
          refreshToken: value,
        },
      } as unknown as Request;

      await expect(controller.refreshToken(req, createResponse(), jest.fn())).rejects.toBeInstanceOf(
        AuthenticationException,
      );
      expect(authService.refreshToken).not.toHaveBeenCalled();
    },
  );

  it('passes a non-empty refresh cookie to the auth service and keeps it out of JSON', async () => {
    const authService = {
      refreshToken: jest.fn().mockResolvedValue(createAuthResult()),
    } as any;
    const controller = new AuthController(authService, {} as any, {} as any);
    const response = createResponse();
    const req = {
      cookies: {
        refreshToken: 'refresh-token',
      },
    } as unknown as Request;

    await controller.refreshToken(req, response, jest.fn());

    expect(authService.refreshToken).toHaveBeenCalledWith({ refreshToken: 'refresh-token' });
    expect(response.cookie).toHaveBeenCalledWith(
      'accessToken',
      'access-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api',
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/auth',
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      message: 'Token refreshed successfully',
      user: createAuthResult().user,
    });
  });

  it('clears both auth cookies on logout', async () => {
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

    expect(authService.logout).toHaveBeenCalledWith('refresh-token');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'accessToken',
      expect.objectContaining({
        path: '/api',
      }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({
        path: '/api/auth',
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      message: 'Logout successful',
    });
  });
});
