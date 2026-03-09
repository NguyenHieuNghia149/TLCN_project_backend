import { z } from 'zod';

export const CreateSolutionApproachSchema = z.object({
  title: z.string().min(1, 'Solution approach title is required.'),
  description: z.string().optional(),
  sourceCode: z.string().min(1, 'Solution approach source code is required.'),
  language: z.string().min(1, 'Solution approach language is required.'),
  timeComplexity: z.string().optional(),
  spaceComplexity: z.string().optional(),
  explanation: z.string().optional(),
  order: z.number().int().min(1, 'Solution approach order must be at least 1.'),
  isVisible: z.boolean().optional(),
});

export type SolutionApproachInput = z.infer<typeof CreateSolutionApproachSchema>;

export const CreateSolutionSchema = z.object({
  title: z.string().min(1, 'Solution title is required.'),
  description: z.string().optional(),
  videoUrl: z.string().url({ message: 'Invalid video URL.' }).optional().or(z.literal('')),
  imageUrl: z.string().url({ message: 'Invalid image URL.' }).optional().or(z.literal('')),
  isVisible: z.boolean().optional(),
  solutionApproaches: z.array(CreateSolutionApproachSchema).optional(),
});

export type SolutionInput = z.infer<typeof CreateSolutionSchema>;

export const UpdateSolutionVisibilitySchema = z.object({
  isVisible: z.boolean(),
});

export type UpdateSolutionVisibilityInput = z.infer<typeof UpdateSolutionVisibilitySchema>;

export const SolutionApproachResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  sourceCode: z.string(),
  language: z.string(),
  timeComplexity: z.string(),
  spaceComplexity: z.string(),
  explanation: z.string(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SolutionApproachResponse = z.infer<typeof SolutionApproachResponseSchema>;

export const SolutionResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  videoUrl: z.string(),
  imageUrl: z.string(),
  isVisible: z.boolean(),
  solutionApproaches: z.array(SolutionApproachResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SolutionResponse = z.infer<typeof SolutionResponseSchema>;
