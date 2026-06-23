import { CookieOptions, Response } from 'express';

export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

const ACCESS_TOKEN_COOKIE_PATH = '/api';
const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';
const AUTH_COOKIE_SAME_SITE: CookieOptions['sameSite'] = 'strict';

function createBaseAuthCookieOptions(): Pick<CookieOptions, 'httpOnly' | 'sameSite' | 'secure'> {
  return {
    httpOnly: true,
    sameSite: AUTH_COOKIE_SAME_SITE,
    secure: process.env.NODE_ENV === 'production',
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
