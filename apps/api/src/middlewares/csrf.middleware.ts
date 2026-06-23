import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';
const PUBLIC_AUTH_BOOTSTRAP_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/refresh-token',
  '/api/auth/send-verification-email',
  '/api/auth/send-reset-otp',
  '/api/auth/verify-otp',
  '/api/auth/reset-password',
]);

function readCookieValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function hasBrowserAuthCookie(req: Request): boolean {
  return (
    readCookieValue(req.cookies?.accessToken) !== undefined ||
    readCookieValue(req.cookies?.refreshToken) !== undefined
  );
}

function resolveRequestPath(req: Request): string | undefined {
  const candidate = req.path || req.originalUrl;
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return undefined;
  }

  return candidate.split('?')[0];
}

function isPublicAuthBootstrapRoute(req: Request): boolean {
  const path = resolveRequestPath(req);
  return path !== undefined && PUBLIC_AUTH_BOOTSTRAP_PATHS.has(path);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (!hasBrowserAuthCookie(req)) {
    next();
    return;
  }

  if (isPublicAuthBootstrapRoute(req)) {
    next();
    return;
  }

  const csrfCookieToken = readCookieValue(req.cookies?.[CSRF_COOKIE_NAME]);
  const csrfHeaderToken = readCookieValue(req.headers[CSRF_HEADER_NAME]);

  if (!csrfCookieToken || !csrfHeaderToken || csrfCookieToken !== csrfHeaderToken) {
    res.status(403).json({
      success: false,
      message: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_MISMATCH',
    });
    return;
  }

  next();
}
