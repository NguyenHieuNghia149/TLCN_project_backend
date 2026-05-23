import { z } from 'zod';

export const BanUserDtoSchema = z.object({
  reason: z
    .string()
    .min(10, 'Ban reason must be at least 10 characters')
    .max(500, 'Ban reason cannot exceed 500 characters'),
});

export type BanUserDto = z.infer<typeof BanUserDtoSchema>;
