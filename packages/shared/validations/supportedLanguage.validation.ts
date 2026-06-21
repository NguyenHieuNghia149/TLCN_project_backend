import { z } from 'zod';

export const UpdateSupportedLanguageSchema = z
  .object({
    displayName: z.string().min(1, 'Display name is required.').optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be at least 0.').optional(),
  })
  .refine(value => Object.values(value).some(field => field !== undefined), {
    message: 'At least one language field must be updated.',
  });

export type UpdateSupportedLanguageInput = z.infer<typeof UpdateSupportedLanguageSchema>;
