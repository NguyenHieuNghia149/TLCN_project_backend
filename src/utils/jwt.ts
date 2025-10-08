import jwt, { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { config } from 'dotenv';
import { InvalidTokenException, TokenExpiredException } from '@/exceptions/auth.exceptions';

config();

// Validate JWT secrets
if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be provided in environment variables'
  );
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JWTPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class JWTUtils {
  private static readonly ACCESS_TOKEN_OPTIONS: SignOptions = {
    expiresIn: ACCESS_EXPIRES as any,
  };

  private static readonly REFRESH_TOKEN_OPTIONS: SignOptions = {
    expiresIn: REFRESH_EXPIRES as any,
  };

  static generateAccessToken(userId: string, email: string, role: string): string {
    const payload: Partial<JWTPayload> = {
      userId,
      email,
      role,
      type: 'access',
    };

    return jwt.sign(payload, ACCESS_SECRET, this.ACCESS_TOKEN_OPTIONS as SignOptions);
  }

  static generateRefreshToken(userId: string, email: string, role: string): string {
    const payload: Partial<JWTPayload> = {
      userId,
      email,
      role,
      type: 'refresh',
    };

    return jwt.sign(payload, REFRESH_SECRET, this.REFRESH_TOKEN_OPTIONS);
  }

  static generateTokenPair(userId: string, email: string, role: string): TokenPair {
    const accessToken = this.generateAccessToken(userId, email, role);
    const refreshToken = this.generateRefreshToken(userId, email, role);

    const decoded = jwt.decode(accessToken) as JWTPayload;
    const expiresIn = decoded.exp
      ? (decoded.exp - Math.floor(Date.now() / 1000)) * 1000
      : 15 * 60 * 1000;

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  static verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, ACCESS_SECRET) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredException('Access token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new InvalidTokenException('Invalid access token');
      }
      throw error;
    }
  }

  static verifyRefreshToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, REFRESH_SECRET) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredException('Refresh token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new InvalidTokenException('Invalid refresh token');
      }
      throw error;
    }
  }

  static decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }

  static isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return true;

      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch {
      return true;
    }
  }

  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return null;

      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }
}

// Legacy functions for backward compatibility
export const generateTokens = (userId: string, email: string, role: string = 'user'): TokenPair => {
  return JWTUtils.generateTokenPair(userId, email, role);
};

export const verifyAccessToken = (token: string): JWTPayload => {
  return JWTUtils.verifyAccessToken(token);
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  return JWTUtils.verifyRefreshToken(token);
};
