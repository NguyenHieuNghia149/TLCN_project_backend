import { z } from 'zod';
const requiredUnknown = (message: string) => z.unknown().refine(value => value !== undefined, message);
export const CreateTestcaseSchema = z.object({
  inputJson: requiredUnknown('Structured testcase inputJson is required.'),
  outputJson: requiredUnknown('Structured testcase outputJson is required.'),
  isPublic: z.boolean().optional(),
  point: z.number().int().optional(),
});
export type TestcaseInput = z.infer<typeof CreateTestcaseSchema>;
export const TestcaseResponseSchema = z.object({
  id: z.string(),
  inputJson: requiredUnknown('Structured testcase inputJson is required.'),
  outputJson: requiredUnknown('Structured testcase outputJson is required.'),
  input: z.string(),
  output: z.string(),
  isPublic: z.boolean(),
  point: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TestcaseResponse = z.infer<typeof TestcaseResponseSchema>;