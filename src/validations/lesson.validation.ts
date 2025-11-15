import { z } from 'zod';

export const CreateLessonSchema = z.object({
  title: z.string().min(1, 'Lesson title is required.'),
  content: z.string().optional(),
  topicId: z.string().uuid('Invalid Topic ID.'),
});

export type CreateLessonInput = z.infer<typeof CreateLessonSchema>;

export const UpdateLessonSchema = z.object({
  title: z.string().min(1, 'Lesson title is required.').optional(),
  content: z.string().optional(),
  topicId: z.string().uuid('Invalid Topic ID.').optional(),
});

export type UpdateLessonInput = z.infer<typeof UpdateLessonSchema>;

export const LessonResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  topicId: z.string(),
  topicName: z.string().nullable(),
  isFavorite: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LessonResponse = z.infer<typeof LessonResponseSchema>;
