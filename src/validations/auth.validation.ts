import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  passwordConfirm: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  firstname: z.string().min(1, 'Firstname must be at least 1 characters'),
  lastname: z.string().min(1, 'Lastname must be at least 1 characters'),
  otp: z.string().min(6, 'otp idvalid'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const AuthResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatar: z.string().nullable(),
    role: z.string(),
    rankingPoint: z.number().nullable(),
    rank: z.number().optional(),
    status: z.string(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
  }),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const PasswordResetSchema = z.object({
  email: z.string().email('Invalid email format'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  otp: z.string().min(1, 'OTP is required'),
});

export type PasswordResetInput = z.infer<typeof PasswordResetSchema>;

export const SendVerificationEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export type SendVerificationEmailInput = z.infer<typeof SendVerificationEmailSchema>;

export const RegisterResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatar: z.string().nullable(),
    role: z.string(),
    status: z.string(),
    createdAt: z.string(),
  }),
});

export type RegisterResponseSchema = z.infer<typeof RegisterResponseSchema>;

// Removed RevokeSessionSchema
// Google Login
export const GoogleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google idToken is required'),
});

export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;

// OTP Verification Schema
export const VerifyOTPSchema = z.object({
  email: z.string().email('Invalid email format'),
  otp: z.string().min(6, 'OTP must be 6 digits').max(6, 'OTP must be 6 digits'),
});

export type VerifyOTPInput = z.infer<typeof VerifyOTPSchema>;
