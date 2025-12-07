import { z } from 'zod';

export const LeaderboardPaginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1)).optional().default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional().default(20),
  search: z.string().min(1).max(100).optional(),
});

export const TopUsersSchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional().default(10),
});

export const UserRankSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

export const UserRankContextSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  contextSize: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(50)).optional().default(5),
});

export type LeaderboardPaginationInput = z.infer<typeof LeaderboardPaginationSchema>;
export type TopUsersInput = z.infer<typeof TopUsersSchema>;
export type UserRankInput = z.infer<typeof UserRankSchema>;
export type UserRankContextInput = z.infer<typeof UserRankContextSchema>;
