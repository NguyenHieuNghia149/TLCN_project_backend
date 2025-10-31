import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').optional(),
  lastName: z.string().min(1, 'Last name is required.').optional(),
  avatar: z.string().url('Invalid avatar URL.').optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().datetime('Invalid date format.').optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ProfileResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatar: z.string().nullable(),
  gender: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  statistics: z.object({
    totalSubmissions: z.number(),
    acceptedSubmissions: z.number(),
    wrongAnswerSubmissions: z.number(),
    timeLimitExceededSubmissions: z.number(),
    memoryLimitExceededSubmissions: z.number(),
    runtimeErrorSubmissions: z.number(),
    compilationErrorSubmissions: z.number(),
    totalProblemsSolved: z.number(),
    totalProblemsAttempted: z.number(),
    acceptanceRate: z.number(),
  }),
});

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

