import { RefreshTokenEntity, refreshTokens, RefreshTokenInsert } from '@/database/schema';
import { BaseRepository } from './base.repository';
import { eq, and, desc, lt } from 'drizzle-orm';
import {
  RefreshTokenNotFoundException,
  RefreshTokenExpiredException,
} from '@/exceptions/auth.exceptions';

export class TokenRepository extends BaseRepository<
  typeof refreshTokens,
  RefreshTokenEntity,
  RefreshTokenInsert
> {
  constructor() {
    super(refreshTokens);
  }

  // Refresh Token methods
  async findByToken(token: string): Promise<RefreshTokenEntity | null> {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.token, token), eq(refreshTokens.isRevoked, false)))
      .limit(1);
    return result[0] || null;
  }

  async findByUserId(userId: string): Promise<RefreshTokenEntity[]> {
    return await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.isRevoked, false)))
      .orderBy(desc(refreshTokens.createdAt));
  }

  async createRefreshToken(tokenData: RefreshTokenInsert): Promise<RefreshTokenEntity> {
    const [token] = await this.db.insert(refreshTokens).values(tokenData).returning();
    if (!token) {
      throw new Error('Failed to create refresh token');
    }
    return token;
  }

  async revokeToken(token: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.token, token));
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));
  }

  async updateLastUsed(token: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(refreshTokens.token, token));
  }

  async deleteExpiredTokens(): Promise<number> {
    const result = await this.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()));
    return result.rowCount || 0;
  }

  async findByTokenOrThrow(token: string): Promise<RefreshTokenEntity> {
    const refreshToken = await this.findByToken(token);
    if (!refreshToken) {
      throw new RefreshTokenNotFoundException('Refresh token not found');
    }
    return refreshToken;
  }

  //   // Password Reset Token methods
  //   async createPasswordResetToken(tokenData: PasswordResetTokenInsert): Promise<PasswordResetTokenEntity> {
  //     const [token] = await this.db
  //       .insert(passwordResetTokens)
  //       .values(tokenData)
  //       .returning();
  //     if (!token) {
  //       throw new Error('Failed to create password reset token');
  //     }
  //     return token;
  //   }

  //   async findPasswordResetToken(token: string): Promise<PasswordResetTokenEntity | null> {
  //     const [result] = await this.db
  //       .select()
  //       .from(passwordResetTokens)
  //       .where(and(
  //         eq(passwordResetTokens.token, token),
  //         eq(passwordResetTokens.isUsed, false)
  //       ))
  //       .limit(1);
  //     return result || null;
  //   }

  //   async markPasswordResetTokenAsUsed(token: string): Promise<void> {
  //     await this.db
  //       .update(passwordResetTokens)
  //       .set({ isUsed: true })
  //       .where(eq(passwordResetTokens.token, token));
  //   }

  //   async deleteExpiredPasswordResetTokens(): Promise<number> {
  //     const result = await this.db
  //       .delete(passwordResetTokens)
  //       .where(lt(passwordResetTokens.expiresAt, new Date()));
  //     return result.rowCount || 0;
  //   }

  //   // Email Verification Token methods
  //   async createEmailVerificationToken(tokenData: EmailVerificationTokenInsert): Promise<EmailVerificationTokenEntity> {
  //     const [token] = await this.db
  //       .insert(emailVerificationTokens)
  //       .values(tokenData)
  //       .returning();
  //     if (!token) {
  //       throw new Error('Failed to create email verification token');
  //     }
  //     return token;
  //   }

  //   async findEmailVerificationToken(token: string): Promise<EmailVerificationTokenEntity | null> {
  //     const [result] = await this.db
  //       .select()
  //       .from(emailVerificationTokens)
  //       .where(and(
  //         eq(emailVerificationTokens.token, token),
  //         eq(emailVerificationTokens.isUsed, false)
  //       ))
  //       .limit(1);
  //     return result || null;
  //   }

  //   async markEmailVerificationTokenAsUsed(token: string): Promise<void> {
  //     await this.db
  //       .update(emailVerificationTokens)
  //       .set({ isUsed: true })
  //       .where(eq(emailVerificationTokens.token, token));
  //   }

  //   async deleteExpiredEmailVerificationTokens(): Promise<number> {
  //     const result = await this.db
  //       .delete(emailVerificationTokens)
  //       .where(lt(emailVerificationTokens.expiresAt, new Date()));
  //     return result.rowCount || 0;
  //   }

  //   // Login Attempt methods
  //   async createLoginAttempt(attemptData: LoginAttemptInsert): Promise<LoginAttemptEntity> {
  //     const [attempt] = await this.db
  //       .insert(loginAttempts)
  //       .values(attemptData)
  //       .returning();
  //     if (!attempt) {
  //       throw new Error('Failed to create login attempt');
  //     }
  //     return attempt;
  //   }

  //   async getLoginAttemptsByEmail(email: string, hours: number = 24): Promise<LoginAttemptEntity[]> {
  //     const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  //     return await this.db
  //       .select()
  //       .from(loginAttempts)
  //       .where(and(
  //         eq(loginAttempts.email, email),
  //         lt(loginAttempts.createdAt, since)
  //       ))
  //       .orderBy(desc(loginAttempts.createdAt));
  //   }

  //   async getLoginAttemptsByIp(ipAddress: string, hours: number = 24): Promise<LoginAttemptEntity[]> {
  //     const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  //     return await this.db
  //       .select()
  //       .from(loginAttempts)
  //       .where(and(
  //         eq(loginAttempts.ipAddress, ipAddress),
  //         lt(loginAttempts.createdAt, since)
  //       ))
  //       .orderBy(desc(loginAttempts.createdAt));
  //   }

  //   async deleteOldLoginAttempts(days: number = 30): Promise<number> {
  //     const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  //     const result = await this.db
  //       .delete(loginAttempts)
  //       .where(lt(loginAttempts.createdAt, cutoff));
  //     return result.rowCount || 0;
  //   }

  async cleanupExpiredTokens(): Promise<{ refreshTokens: number }> {
    const refreshCount = await this.deleteExpiredTokens();
    return refreshCount as any;
  }
  // Cleanup methods
  //   async cleanupExpiredTokens(): Promise<{
  //     refreshTokens: number;
  //     passwordResetTokens: number;
  //     emailVerificationTokens: number;
  //     loginAttempts: number;
  //   }> {
  //     const [refreshCount, passwordResetCount, emailVerificationCount, loginAttemptsCount] = await Promise.all([
  //       this.deleteExpiredTokens(),
  //       this.deleteExpiredPasswordResetTokens(),
  //       this.deleteExpiredEmailVerificationTokens(),
  //       this.deleteOldLoginAttempts()
  //     ]);

  //     return {
  //       refreshTokens: refreshCount,
  //       passwordResetTokens: passwordResetCount,
  //       emailVerificationTokens: emailVerificationCount,
  //       loginAttempts: loginAttemptsCount,
  //     };
  //   }
}
