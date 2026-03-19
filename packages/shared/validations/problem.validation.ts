import { z } from 'zod';

import { CreateTestcaseSchema, TestcaseResponseSchema } from './testcase.validation';
import { CreateSolutionSchema, SolutionResponseSchema } from './solution.validation';
import {
  buildStarterCodeByLanguage,
  validateFunctionTestcaseInput,
  validateFunctionTestcaseOutput,
} from '@backend/shared/utils';
import {
  EProblemJudgeMode,
  FunctionSignature,
  FunctionStarterCodeByLanguage,
} from '@backend/shared/types';

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

const ScalarTypeNameSchema = z.enum(['int', 'long', 'double', 'bool', 'string']);

const ScalarTypeDescriptorSchema = z.object({
  kind: z.literal('scalar'),
  name: ScalarTypeNameSchema,
});

const ArrayTypeDescriptorSchema = z.object({
  kind: z.literal('array'),
  element: ScalarTypeNameSchema,
});

const MatrixTypeDescriptorSchema = z.object({
  kind: z.literal('matrix'),
  element: ScalarTypeNameSchema,
});

export const FunctionValueTypeSchema = z.discriminatedUnion('kind', [
  ScalarTypeDescriptorSchema,
  ArrayTypeDescriptorSchema,
  MatrixTypeDescriptorSchema,
]);

export const FunctionParameterSchema = z.object({
  name: z.string().min(1, 'Parameter name is required.'),
  type: FunctionValueTypeSchema,
});

export const FunctionSignatureSchema = z.object({
  methodName: z.string().min(1, 'Function methodName is required.'),
  parameters: z.array(FunctionParameterSchema),
  returnType: FunctionValueTypeSchema,
});

const BaseProblemSchema = z.object({
  title: z.string().min(1, 'Problem title is required.'),
  description: z.string().min(1, 'Problem description is required.'),
  difficulty: z
    .enum(['easy', 'medium', 'hard'], {
      message: 'Problem difficulty is required.',
    })
    .default('easy'),
  constraint: z.string(),
  tags: z.array(z.string()).optional(),
  lessonId: z.string().uuid({ message: 'Invalid Lesson ID.' }).optional(),
  topicId: z.string().uuid({ message: 'Invalid Topic ID.' }).optional(),
  visibility: z.string().optional(),
  judgeMode: z.nativeEnum(EProblemJudgeMode).default(EProblemJudgeMode.STDIN_STDOUT),
  functionSignature: FunctionSignatureSchema.optional(),
  solution: CreateSolutionSchema.optional(),
  testcases: z
    .array(CreateTestcaseSchema)
    .min(1, 'At least one testcase is required for a problem.'),
});

export const CreateProblemSchema = BaseProblemSchema.superRefine((value, ctx) => {
  if (value.judgeMode === EProblemJudgeMode.FUNCTION_SIGNATURE) {
    if (!value.functionSignature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['functionSignature'],
        message: 'functionSignature is required for function-signature problems.',
      });
      return;
    }

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

    return;
  }

  value.testcases.forEach((testcase, index) => {
    if (!testcase.input) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['testcases', index, 'input'],
        message: 'stdin/stdout testcase requires input text.',
      });
    }

    if (!testcase.output) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['testcases', index, 'output'],
        message: 'stdin/stdout testcase requires output text.',
      });
    }
  });
});

export type ProblemInput = z.infer<typeof CreateProblemSchema>;

export const UpdateProblemSchema = BaseProblemSchema.partial().superRefine((value, ctx) => {
  if (value.judgeMode === EProblemJudgeMode.FUNCTION_SIGNATURE && !value.functionSignature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['functionSignature'],
      message: 'functionSignature is required when switching to function-signature mode.',
    });
  }
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
  judgeMode: z.nativeEnum(EProblemJudgeMode).default(EProblemJudgeMode.STDIN_STDOUT),
  functionSignature: FunctionSignatureSchema.optional(),
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
