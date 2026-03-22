import './load-env';
import crypto from 'crypto';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface JWTPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  nonce?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

type JWTUtilsLike = {
  generateAccessToken(userId: string, email: string, role: string): string;
  generateRefreshToken(userId: string, email: string, role: string): string;
  generateTokenPair(userId: string, email: string, role: string): TokenPair;
  verifyAccessToken(token: string): JWTPayload;
  verifyRefreshToken(token: string): JWTPayload;
  decodeToken(token: string): JWTPayload | null;
  isTokenExpired(token: string): boolean;
  getTokenExpiration(token: string): Date | null;
};

/** Reads JWT config from the current environment and validates required secrets. */
export function readJWTConfigFromEnv(): JWTConfig {
  const accessSecret = process.env['JWT_ACCESS_SECRET'];
  const refreshSecret = process.env['JWT_REFRESH_SECRET'];

  if (!accessSecret || !refreshSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be provided in environment variables',
    );
  }

  return {
    accessSecret,
    refreshSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  };
}

/** Builds sign options from an expiration string. */
function createSignOptions(expiresIn: string): SignOptions {
  return {
    expiresIn: expiresIn as any,
  };
}

/** Decodes a JWT without verifying the signature. */
function decodeTokenValue(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}

/** Determines whether a decoded JWT should be treated as expired. */
function isTokenExpiredValue(token: string): boolean {
  try {
    const decoded = decodeTokenValue(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch {
    return true;
  }
}

/** Gets the expiration date for a JWT if one is present. */
function getTokenExpirationValue(token: string): Date | null {
  try {
    const decoded = decodeTokenValue(token);
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
}

/** Generates an access token using explicit JWT config. */
function generateAccessTokenWithConfig(
  config: JWTConfig,
  userId: string,
  email: string,
  role: string,
): string {
  const payload: Partial<JWTPayload> = {
    userId,
    email,
    role,
    type: 'access',
  };

  return jwt.sign(payload, config.accessSecret, createSignOptions(config.accessExpiresIn));
}

/** Generates a refresh token using explicit JWT config. */
function generateRefreshTokenWithConfig(
  config: JWTConfig,
  userId: string,
  email: string,
  role: string,
): string {
  const payload: Partial<JWTPayload> = {
    userId,
    email,
    role,
    type: 'refresh',
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  return jwt.sign(payload, config.refreshSecret, createSignOptions(config.refreshExpiresIn));
}

/** Verifies a JWT and maps library errors to the stable public messages. */
function verifyToken(
  token: string,
  secret: string,
  expiredMessage: string,
  invalidMessage: string,
): JWTPayload {
  try {
    return jwt.verify(token, secret) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error(expiredMessage);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(invalidMessage);
    }
    throw error;
  }
}

/** Creates JWT helper methods bound to an explicit config object. */
export function createJWTUtils(config: JWTConfig): JWTUtilsLike {
  return {
    generateAccessToken(userId: string, email: string, role: string): string {
      return generateAccessTokenWithConfig(config, userId, email, role);
    },

    generateRefreshToken(userId: string, email: string, role: string): string {
      return generateRefreshTokenWithConfig(config, userId, email, role);
    },

    generateTokenPair(userId: string, email: string, role: string): TokenPair {
      const accessToken = generateAccessTokenWithConfig(config, userId, email, role);
      const refreshToken = generateRefreshTokenWithConfig(config, userId, email, role);
      const decoded = decodeTokenValue(accessToken);
      const expiresIn = decoded?.exp
        ? (decoded.exp - Math.floor(Date.now() / 1000)) * 1000
        : 15 * 60 * 1000;

      return {
        accessToken,
        refreshToken,
        expiresIn,
      };
    },

    verifyAccessToken(token: string): JWTPayload {
      return verifyToken(
        token,
        config.accessSecret,
        'Access token has expired',
        'Invalid access token',
      );
    },

    verifyRefreshToken(token: string): JWTPayload {
      return verifyToken(
        token,
        config.refreshSecret,
        'Refresh token has expired',
        'Invalid refresh token',
      );
    },

    decodeToken(token: string): JWTPayload | null {
      return decodeTokenValue(token);
    },

    isTokenExpired(token: string): boolean {
      return isTokenExpiredValue(token);
    },

    getTokenExpiration(token: string): Date | null {
      return getTokenExpirationValue(token);
    },
  };
}

/** Builds a fresh helper bound to the current process environment. */
function getJWTUtils(): JWTUtilsLike {
  return createJWTUtils(readJWTConfigFromEnv());
}

export class JWTUtils {
  static generateAccessToken(userId: string, email: string, role: string): string {
    return getJWTUtils().generateAccessToken(userId, email, role);
  }

  static generateRefreshToken(userId: string, email: string, role: string): string {
    return getJWTUtils().generateRefreshToken(userId, email, role);
  }

  static generateTokenPair(userId: string, email: string, role: string): TokenPair {
    return getJWTUtils().generateTokenPair(userId, email, role);
  }

  static verifyAccessToken(token: string): JWTPayload {
    return getJWTUtils().verifyAccessToken(token);
  }

  static verifyRefreshToken(token: string): JWTPayload {
    return getJWTUtils().verifyRefreshToken(token);
  }

  static decodeToken(token: string): JWTPayload | null {
    return decodeTokenValue(token);
  }

  static isTokenExpired(token: string): boolean {
    return isTokenExpiredValue(token);
  }

  static getTokenExpiration(token: string): Date | null {
    return getTokenExpirationValue(token);
  }
}

export const generateTokens = (userId: string, email: string, role: string = 'user'): TokenPair => {
  return JWTUtils.generateTokenPair(userId, email, role);
};

export const verifyAccessToken = (token: string): JWTPayload => {
  return JWTUtils.verifyAccessToken(token);
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  return JWTUtils.verifyRefreshToken(token);
};
