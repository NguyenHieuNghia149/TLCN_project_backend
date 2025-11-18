import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
    lessonId: z.string().uuid().optional(),
    problemId: z.string().uuid().optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid id format') }),
});
