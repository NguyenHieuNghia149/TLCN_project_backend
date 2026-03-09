import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';

// Password validation schema
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

// Password hashing utilities
export class PasswordUtils {
  private static readonly SALT_ROUNDS = 12;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Token generation utilities
export class TokenUtils {
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  static generateEmailVerificationToken(): string {
    return this.generateSecureToken(32);
  }

  static generatePasswordResetToken(): string {
    return this.generateSecureToken(32);
  }

  static generateRefreshToken(): string {
    return this.generateSecureToken(64);
  }
}

// Rate limiting utilities
export class RateLimitUtils {
  private static attempts: Map<string, { count: number; resetTime: number }> = new Map();

  static checkRateLimit(
    key: string,
    maxAttempts: number,
    windowMs: number
  ): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const attempt = this.attempts.get(key);

    if (!attempt || now > attempt.resetTime) {
      // Reset or create new attempt
      this.attempts.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });

      return {
        allowed: true,
        remaining: maxAttempts - 1,
        resetTime: now + windowMs,
      };
    }

    if (attempt.count >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: attempt.resetTime,
      };
    }

    attempt.count++;
    return {
      allowed: true,
      remaining: maxAttempts - attempt.count,
      resetTime: attempt.resetTime,
    };
  }

  static clearRateLimit(key: string): void {
    this.attempts.delete(key);
  }
}

// Account lockout utilities
export class AccountLockoutUtils {
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  static isAccountLocked(loginAttempts: number, lockedUntil: Date | null): boolean {
    if (!lockedUntil) return false;
    return loginAttempts >= this.MAX_LOGIN_ATTEMPTS && new Date() < lockedUntil;
  }

  static getLockoutTime(): Date {
    return new Date(Date.now() + this.LOCKOUT_DURATION);
  }

  static shouldIncrementAttempts(loginAttempts: number, lockedUntil: Date | null): boolean {
    return !this.isAccountLocked(loginAttempts, lockedUntil);
  }

  static resetLoginAttempts(): { loginAttempts: number; lockedUntil: Date | null } {
    return {
      loginAttempts: 0,
      lockedUntil: null,
    };
  }
}

// Input sanitization utilities
export class SanitizationUtils {
  static sanitizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  static sanitizeName(name: string): string {
    return name.trim().replace(/[<>]/g, '');
  }
}

// Device fingerprinting utilities
export class DeviceUtils {
  static generateDeviceFingerprint(userAgent: string, ipAddress: string): string {
    const data = `${userAgent}-${ipAddress}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static extractDeviceInfo(userAgent: string): {
    browser: string;
    os: string;
    device: string;
  } {
    // Simple device detection (in production, use a library like ua-parser-js)
    const browser = userAgent.includes('Chrome')
      ? 'Chrome'
      : userAgent.includes('Firefox')
        ? 'Firefox'
        : userAgent.includes('Safari')
          ? 'Safari'
          : 'Unknown';

    const os = userAgent.includes('Windows')
      ? 'Windows'
      : userAgent.includes('Mac')
        ? 'macOS'
        : userAgent.includes('Linux')
          ? 'Linux'
          : 'Unknown';

    const device = userAgent.includes('Mobile') ? 'Mobile' : 'Desktop';

    return { browser, os, device };
  }
}
