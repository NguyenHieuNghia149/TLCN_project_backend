import { z } from 'zod';

import { CreateTestcaseSchema, TestcaseResponseSchema } from './testcase.validation';
import { CreateSolutionSchema, SolutionResponseSchema } from './solution.validation';
import {
  buildStarterCodeByLanguage,
  normalizeFunctionSignature,
  normalizeFunctionTypeNode,
  validateFunctionTestcaseInput,
  validateFunctionTestcaseOutput,
} from '@backend/shared/utils';
import { FunctionSignature, FunctionStarterCodeByLanguage } from '@backend/shared/types';

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

function toZodCustomIssue(error: unknown): { code: 'custom'; message: string } {
  return {
    code: z.ZodIssueCode.custom,
    message: error instanceof Error ? error.message : 'Invalid function signature.',
  };
}

function normalizeFunctionArgumentInput(value: unknown): unknown {
  const normalized = normalizeFunctionSignature({
    name: 'placeholder',
    args: [value],
    returnType: { type: 'integer' },
  });

  return normalized.args[0];
}

export const FunctionScalarTypeSchema = z.enum(['integer', 'number', 'string', 'boolean']);

export const FunctionTypeNodeSchema = z.unknown().transform((value, ctx) => {
  try {
    return normalizeFunctionTypeNode(value);
  } catch (error) {
    ctx.addIssue(toZodCustomIssue(error));
    return z.NEVER;
  }
});

export const FunctionArgumentSchema = z.unknown().transform((value, ctx) => {
  try {
    return normalizeFunctionArgumentInput(value);
  } catch (error) {
    ctx.addIssue(toZodCustomIssue(error));
    return z.NEVER;
  }
});

export const FunctionSignatureSchema = z.unknown().transform((value, ctx) => {
  try {
    return normalizeFunctionSignature(value);
  } catch (error) {
    ctx.addIssue(toZodCustomIssue(error));
    return z.NEVER;
  }
});

const BaseProblemSchema = z
  .object({
    title: z.string().min(1, 'Problem title is required.'),
    description: z.string().min(1, 'Problem description is required.'),
    difficulty: z.enum(['easy', 'medium', 'hard'], {
      message: 'Problem difficulty is required.',
    }).default('easy'),
    constraint: z.string(),
    tags: z.array(z.string()).optional(),
    lessonId: z.string().uuid({ message: 'Invalid Lesson ID.' }).optional(),
    topicId: z.string().uuid({ message: 'Invalid Topic ID.' }).optional(),
    visibility: z.string().optional(),
    functionSignature: FunctionSignatureSchema,
    solution: CreateSolutionSchema.optional(),
    testcases: z.array(CreateTestcaseSchema).min(1, 'At least one testcase is required for a problem.'),
  })
  .strict();

function validateFunctionProblem(
  value: z.infer<typeof BaseProblemSchema>,
  ctx: z.RefinementCtx,
): void {
  value.testcases.forEach((testcase, index) => {
    if (testcase.inputJson === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['testcases', index, 'inputJson'],
        message: 'Function-style testcase requires inputJson.',
      });
    } else {
      const error = validateFunctionTestcaseInput(
        value.functionSignature as FunctionSignature,
        testcase.inputJson,
      );
      if (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['testcases', index, 'inputJson'],
          message: error,
        });
      }
    }

    if (testcase.outputJson === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['testcases', index, 'outputJson'],
        message: 'Function-style testcase requires outputJson.',
      });
    } else {
      const error = validateFunctionTestcaseOutput(
        value.functionSignature as FunctionSignature,
        testcase.outputJson,
      );
      if (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['testcases', index, 'outputJson'],
          message: error,
        });
      }
    }
  });
}

export const CreateProblemSchema = BaseProblemSchema.superRefine((value, ctx) => {
  validateFunctionProblem(value, ctx);
});

export type ProblemInput = z.infer<typeof CreateProblemSchema>;

export const UpdateProblemSchema = BaseProblemSchema.partial().superRefine((value, ctx) => {
  if (!value.functionSignature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['functionSignature'],
      message: 'functionSignature is required.',
    });
    return;
  }

  if (!value.testcases) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['testcases'],
      message: 'testcases are required.',
    });
    return;
  }

  validateFunctionProblem(value as z.infer<typeof BaseProblemSchema>, ctx);
});
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
  functionSignature: FunctionSignatureSchema,
  starterCodeByLanguage: z.record(z.string(), z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProblemResponse = z.infer<typeof ProblemResponseSchema> & {
  starterCodeByLanguage?: FunctionStarterCodeByLanguage;
};

export const ChallengeResponseSchema = z.object({
  problem: ProblemResponseSchema,
  testcases: z.array(TestcaseResponseSchema),
  solution: SolutionResponseSchema.optional(),
});

export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>;

export function buildProblemStarterCode(signature?: FunctionSignature | null) {
  return signature ? buildStarterCodeByLanguage(signature) : undefined;
}
