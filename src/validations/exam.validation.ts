import { z } from 'zod';
import {
  CreateProblemSchema,
  ProblemInput,
  CreateTestcaseSchema,
  CreateSolutionSchema,
} from './problem.validation';

// Union type for challenge input: either existing challenge ID or new challenge object
export const ExistingChallengeSchema = z.object({
  challengeId: z.string().uuid('Invalid challenge ID format.'),
});

export const NewChallengeSchema = CreateProblemSchema.extend({
  // New challenge must have all required fields from ProblemInput
});

export const ExamChallengeInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('existing'),
    challengeId: z.string().uuid('Invalid challenge ID format.'),
    orderIndex: z.number().int().min(0, 'Order index must be non-negative.').optional(),
  }),
  z.object({
    type: z.literal('new'),
    challenge: CreateProblemSchema,
    orderIndex: z.number().int().min(0, 'Order index must be non-negative.').optional(),
  }),
]);

export type ExamChallengeInput = z.infer<typeof ExamChallengeInputSchema>;

// Exam creation schema
export const CreateExamSchema = z
  .object({
    title: z.string().min(1, 'Exam title is required.').max(255, 'Exam title is too long.'),
    password: z.string().min(1, 'Exam password is required.').max(255, 'Password is too long.'),
    duration: z
      .number()
      .int()
      .min(1, 'Duration must be at least 1 minute.')
      .max(1440, 'Duration cannot exceed 1440 minutes (24 hours).'),
    startDate: z.string().datetime('Invalid start date format.'),
    endDate: z.string().datetime('Invalid end date format.'),
    isVisible: z.boolean().optional().default(false),
    maxAttempts: z.number().int().min(1, 'Max attempts must be at least 1.').optional().default(1),
    challenges: z
      .array(ExamChallengeInputSchema)
      .min(1, 'At least one challenge is required for an exam.'),
  })
  .refine(
    data => {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      return endDate > startDate;
    },
    {
      message: 'End date must be after start date.',
      path: ['endDate'],
    }
  );

export type CreateExamInput = z.infer<typeof CreateExamSchema>;

// Exam response schema - support both basic and detailed challenge info
export const ExamChallengeResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  difficulty: z.string(),
  topic: z.string().optional(),
  totalPoints: z.number().optional(),
  constraint: z.string().optional(),
  tags: z.array(z.string()).optional(),
  orderIndex: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ExamResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  password: z.string(),
  duration: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  isVisible: z.boolean(),
  maxAttempts: z.number(),
  challenges: z.array(ExamChallengeResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ExamResponse = z.infer<typeof ExamResponseSchema>;

// Join exam schema
export const JoinExamSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
});

export type JoinExamInput = z.infer<typeof JoinExamSchema>;

// Submit exam schema
export const SubmitExamSchema = z.object({
  participationId: z.string().uuid('Invalid participation ID format.'),
});

export type SubmitExamInput = z.infer<typeof SubmitExamSchema>;

// Exam participation response schema
export const ExamParticipationResponseSchema = z.object({
  id: z.string(),
  examId: z.string(),
  userId: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  isCompleted: z.boolean(),
  totalScore: z.number().optional(),
  createdAt: z.string().optional(),
});

export type ExamParticipationResponse = z.infer<typeof ExamParticipationResponseSchema>;

// Exam leaderboard entry schema
export const ExamLeaderboardEntrySchema = z.object({
  userId: z.string(),
  userName: z.string(),
  email: z.string(),
  totalScore: z.number(),
  perProblem: z.array(
    z.object({
      problemId: z.string(),
      obtained: z.number(),
      maxPoints: z.number(),
    })
  ),
  submittedAt: z.string(),
  rank: z.number().optional(),
});

export type ExamLeaderboardEntry = z.infer<typeof ExamLeaderboardEntrySchema>;

// Get exam leaderboard schema
export const GetExamLeaderboardSchema = z.object({
  examId: z.string().uuid('Invalid exam ID format.'),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

export type GetExamLeaderboardInput = z.infer<typeof GetExamLeaderboardSchema>;
