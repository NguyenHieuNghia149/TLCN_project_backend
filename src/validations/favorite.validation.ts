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

// Lesson favorite schemas
export const LessonFavoriteInputSchema = z.object({
  lessonId: z.string().uuid('Invalid lesson ID'),
});

export type LessonFavoriteInput = z.infer<typeof LessonFavoriteInputSchema>;

export const LessonFavoriteParamsSchema = z.object({
  lessonId: z.string().uuid('Invalid lesson ID'),
});

export type LessonFavoriteParams = z.infer<typeof LessonFavoriteParamsSchema>;

export const LessonFavoriteResponseSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  createdAt: z.string(),
  lesson: z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    videoUrl: z.string(),
    topicId: z.string(),
    topicName: z.string().nullable(),
    isFavorite: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).nullable(),
});

export type LessonFavoriteResponse = z.infer<typeof LessonFavoriteResponseSchema>;

export const ToggleLessonFavoriteResponseSchema = z.object({
  isFavorite: z.boolean(),
  message: z.string(),
  data: LessonFavoriteResponseSchema.nullable(),
});

export type ToggleLessonFavoriteResponse = z.infer<typeof ToggleLessonFavoriteResponseSchema>;
