import { CookieOptions, Response } from 'express';

export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const CSRF_COOKIE_NAME = 'csrfToken';

const ACCESS_TOKEN_COOKIE_PATH = '/api';
const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';
const CSRF_COOKIE_PATH = '/api';

function resolveAuthCookieSameSite(): CookieOptions['sameSite'] {
  const configuredSameSite = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();

  if (configuredSameSite === 'none') {
    return 'none';
  }

  return 'lax';
}

function createBaseAuthCookieOptions(): Pick<CookieOptions, 'httpOnly' | 'sameSite' | 'secure'> {
  const sameSite = resolveAuthCookieSameSite();

  return {
    httpOnly: true,
    sameSite,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
  };
}

export function createCsrfCookieOptions(): CookieOptions {
  const sameSite = resolveAuthCookieSameSite();

  return {
    httpOnly: false,
    sameSite,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    path: CSRF_COOKIE_PATH,
  };
}

export function createAccessTokenCookieOptions(maxAge: number): CookieOptions {
  return {
    ...createBaseAuthCookieOptions(),
    maxAge,
    path: ACCESS_TOKEN_COOKIE_PATH,
  };
}

export function createRefreshTokenCookieOptions(maxAge: number): CookieOptions {
  return {
    ...createBaseAuthCookieOptions(),
    maxAge,
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}

export function createAccessTokenClearCookieOptions(): CookieOptions {
  return {
    ...createBaseAuthCookieOptions(),
    path: ACCESS_TOKEN_COOKIE_PATH,
  };
}

export function createRefreshTokenClearCookieOptions(): CookieOptions {
  return {
    ...createBaseAuthCookieOptions(),
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}

export function setAccessTokenCookie(
  res: Response,
  accessToken: string,
  maxAge: number,
): void {
  res.cookie(
    ACCESS_TOKEN_COOKIE_NAME,
    accessToken,
    createAccessTokenCookieOptions(maxAge),
  );
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  maxAge: number,
): void {
  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    createRefreshTokenCookieOptions(maxAge),
  );
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, createAccessTokenClearCookieOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, createRefreshTokenClearCookieOptions());
}

export function setCsrfTokenCookie(res: Response, csrfToken: string): void {
  res.cookie(CSRF_COOKIE_NAME, csrfToken, createCsrfCookieOptions());
}

export function clearCsrfTokenCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, createCsrfCookieOptions());
}
