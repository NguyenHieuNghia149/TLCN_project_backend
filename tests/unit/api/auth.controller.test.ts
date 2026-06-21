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

describe('AuthController', () => {
  afterEach(() => {
    jest.clearAllMocks();
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
      refreshToken: jest.fn().mockResolvedValue({
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
      }),
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
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/auth/refresh-token',
      }),
    );
    expect(response.json).toHaveBeenCalledWith({
      message: 'Token refreshed successfully',
      user: expect.any(Object),
      tokens: {
        accessToken: 'access-token',
        expiresIn: 60_000,
      },
    });
  });
});
