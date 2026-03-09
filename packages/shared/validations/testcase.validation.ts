import { z } from 'zod';

export const CreateTestcaseSchema = z.object({
  input: z.string().min(1, 'Testcase input cannot be empty.'),
  output: z.string().min(1, 'Testcase expected output cannot be empty.'),
  isPublic: z.boolean().optional(),
  point: z.number().int().optional(),
});

export type TestcaseInput = z.infer<typeof CreateTestcaseSchema>;

export const TestcaseResponseSchema = z.object({
  id: z.string(),
  input: z.string(),
  output: z.string(),
  isPublic: z.boolean(),
  point: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TestcaseResponse = z.infer<typeof TestcaseResponseSchema>;
