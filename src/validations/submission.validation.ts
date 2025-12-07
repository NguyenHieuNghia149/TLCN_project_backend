import { z } from 'zod';

// Execution interfaces moved from code-execution.service.ts
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

export interface Testcase {
  id: string;
  input: string;
  output: string;
  point: number;
}

export interface ExecutionConfig {
  code: string;
  language: string;
  testcases: Testcase[];
  timeLimit: number;
  memoryLimit: string;
}

// Supported languages
const supportedLanguages = ['cpp', 'python', 'java', 'javascript'] as const;

// Create submission schema
export const CreateSubmissionSchema = z.object({
  sourceCode: z.string().min(1, 'Source code is required').max(50000, 'Code too long (max 50KB)'),
  language: z.enum(supportedLanguages, {
    message: 'Unsupported language. Supported: cpp, python, java, javascript',
  }),
  problemId: z.string().uuid('Invalid problem ID'),
  participationId: z.string().uuid().optional(),
});

export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;

// Submission response schema
export const SubmissionResponseSchema = z.object({
  submissionId: z.string().uuid(),
  status: z.string(),
  message: z.string(),
  queuePosition: z.number().optional(),
  estimatedWaitTime: z.number().optional(),
});

export type SubmissionResponse = z.infer<typeof SubmissionResponseSchema>;

// Submission status schema
export const SubmissionStatusSchema = z.object({
  submissionId: z.string().uuid(),
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
  language: z.string(),
  sourceCode: z.string(),
  status: z.enum([
    'PENDING',
    'RUNNING',
    'ACCEPTED',
    'WRONG_ANSWER',
    'TIME_LIMIT_EXCEEDED',
    'MEMORY_LIMIT_EXCEEDED',
    'RUNTIME_ERROR',
    'COMPILATION_ERROR',
  ]),
  result: z
    .object({
      passed: z.number(),
      total: z.number(),
      results: z.array(
        z.object({
          index: z.number(),
          input: z.string(),
          expected: z.string(),
          actual: z.string(),
          ok: z.boolean(),
          stderr: z.string(),
          executionTime: z.number(),
          error: z.string().optional(),
          isPublic: z.boolean().optional(),
        })
      ),
    })
    .optional(),
  score: z.number().optional(),
  submittedAt: z.date(),
  judgedAt: z.date().optional(),
  executionTime: z.number().optional(),
});

export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

// Get submissions query schema
export const GetSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum([
      'PENDING',
      'RUNNING',
      'ACCEPTED',
      'WRONG_ANSWER',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'RUNTIME_ERROR',
      'COMPILATION_ERROR',
    ])
    .optional(),
  participationId: z.string().uuid().optional(),
});

export type GetSubmissionsQuery = z.infer<typeof GetSubmissionsQuerySchema>;

// Queue status schema
export const QueueStatusSchema = z.object({
  queueLength: z.number(),
  isHealthy: z.boolean(),
});

export type QueueStatus = z.infer<typeof QueueStatusSchema>;

// Testcase result schema
export const TestcaseResultSchema = z.object({
  index: z.number(),
  input: z.string(),
  expected: z.string(),
  actual: z.string(),
  ok: z.boolean(),
  stderr: z.string(),
  executionTime: z.number(),
  error: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export type TestcaseResult = z.infer<typeof TestcaseResultSchema>;

// Batch execution result schema
export const BatchExecutionResultSchema = z.object({
  summary: z.object({
    passed: z.number(),
    total: z.number(),
    successRate: z.string(),
  }),
  results: z.array(TestcaseResultSchema),
  processingTime: z.number(),
});

export type BatchExecutionResult = z.infer<typeof BatchExecutionResultSchema>;

// Submission result interface
export interface SubmissionResult {
  passed: number;
  total: number;
  results: Array<{
    testcaseId: string;
    input: string;
    expectedOutput: string;
    actualOutput: string | null;
    isPassed: boolean;
    executionTime: number | null;
    memoryUse: number | null;
    error: string | null;
    isPublic?: boolean;
  }>;
}

export const SubmissionDataResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
  language: z.string(),
  sourceCode: z.string(),
  status: z.string(),
  submittedAt: z.date(),
  judgedAt: z.date().optional(),
});

export type SubmissionDataResponse = z.infer<typeof SubmissionDataResponseSchema>;
