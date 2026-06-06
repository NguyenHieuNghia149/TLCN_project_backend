import './load-env';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface JWTPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface JWTConfig {
  accessSecret: string;
  accessExpiresIn: string;
}

type JWTUtilsLike = {
  generateAccessToken(userId: string, email: string, role: string): string;
  verifyAccessToken(token: string): JWTPayload;
  decodeToken(token: string): JWTPayload | null;
  isTokenExpired(token: string): boolean;
  getTokenExpiration(token: string): Date | null;
};

/** Reads JWT config from the current environment and validates required access-token secrets. */
export function readJWTConfigFromEnv(): JWTConfig {
  const accessSecret = process.env['JWT_ACCESS_SECRET'];

  if (!accessSecret) {
    throw new Error('JWT_ACCESS_SECRET must be provided in environment variables');
  }

  return {
    accessSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
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

/** Verifies an access JWT and maps library errors to stable public messages. */
function verifyAccessTokenValue(token: string, secret: string): JWTPayload {
  try {
    return jwt.verify(token, secret) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid access token');
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

    verifyAccessToken(token: string): JWTPayload {
      return verifyAccessTokenValue(token, config.accessSecret);
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

  static verifyAccessToken(token: string): JWTPayload {
    return getJWTUtils().verifyAccessToken(token);
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

export const verifyAccessToken = (token: string): JWTPayload => {
  return JWTUtils.verifyAccessToken(token);
};
