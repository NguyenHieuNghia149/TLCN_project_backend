import { z } from 'zod';

import { CreateTestcaseSchema, TestcaseResponseSchema } from './testcase.validation';
import { CreateSolutionSchema, SolutionResponseSchema } from './solution.validation';

export {
  CreateTestcaseSchema,
  TestcaseResponseSchema,
  type TestcaseInput,
} from './testcase.validation';
export {
  CreateSolutionSchema,
  CreateSolutionApproachSchema,
  SolutionResponseSchema,
  SolutionApproachResponseSchema,
  UpdateSolutionVisibilitySchema,
  type SolutionInput,
  type SolutionApproachInput,
  type UpdateSolutionVisibilityInput,
} from './solution.validation';

export const CreateProblemSchema = z.object({
  title: z.string().min(1, 'Problem title is required.'),
  description: z.string().min(1, 'Problem description is required.'),
  difficulty: z
    .enum(['easy', 'medium', 'hard'], {
      message: 'Problem difficulty is required.',
    })
    .default('easy'),
  constraint: z.string(),
  tags: z.array(z.string()).optional(),
  lessonid: z.string().uuid({ message: 'Invalid Lesson ID.' }).optional(),
  topicid: z.string().uuid({ message: 'Invalid Topic ID.' }).optional(),
  visibility: z.string().optional(),
  solution: CreateSolutionSchema.optional(),
  testcases: z
    .array(CreateTestcaseSchema)
    .min(1, 'At least one testcase is required for a problem.'),
});

export type ProblemInput = z.infer<typeof CreateProblemSchema>;

export const UpdateProblemSchema = CreateProblemSchema.partial();
export type UpdateProblemInput = z.infer<typeof UpdateProblemSchema>;

export const ProblemResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  constraint: z.string(),
  tags: z.array(z.string()),
  lessonId: z.string(),
  topicId: z.string(),
  totalPoints: z.number().default(0),
  isSolved: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProblemResponse = z.infer<typeof ProblemResponseSchema>;

export const ChallengeResponseSchema = z.object({
  problem: ProblemResponseSchema,
  testcases: z.array(TestcaseResponseSchema),
  solution: SolutionResponseSchema.optional(),
});

export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>;
