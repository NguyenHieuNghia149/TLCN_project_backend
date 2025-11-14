import { ProblemResponseSchema } from './problem.validation';
import { z } from 'zod';

export const FavoriteInputSchema = z.object({
  problemId: z.string().uuid('Invalid challenge ID'),
});

export type FavoriteInput = z.infer<typeof FavoriteInputSchema>;

export const FavoriteParamsSchema = z.object({
  problemId: z.string().uuid('Invalid challenge ID'),
});

export type FavoriteParams = z.infer<typeof FavoriteParamsSchema>;

export const FavoriteResponseSchema = z.object({
  id: z.string(),
  problemId: z.string(),
  createdAt: z.string(),
  problem: ProblemResponseSchema.nullable(),
});

export type FavoriteResponse = z.infer<typeof FavoriteResponseSchema>;

export const ToggleFavoriteResponseSchema = z.object({
  isFavorite: z.boolean(),
  message: z.string(),
  data: FavoriteResponseSchema.nullable(),
});

export type ToggleFavoriteResponse = z.infer<typeof ToggleFavoriteResponseSchema>;
