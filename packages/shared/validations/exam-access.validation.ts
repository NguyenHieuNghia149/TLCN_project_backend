import { z } from 'zod';

export const ExamAccessModeSchema = z.enum([
  'open_registration',
  'invite_only',
  'hybrid',
]);

export const SelfRegistrationApprovalModeSchema = z.enum(['auto', 'manual']);

export const ExamParticipantApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
]);

export const ExamParticipantAccessStatusSchema = z.enum([
  'invited',
  'eligible',
  'active',
  'revoked',
  'completed',
]);

export const ExamEntrySessionStatusSchema = z.enum([
  'opened',
  'verified',
  'eligible',
  'started',
  'expired',
]);

export const ExamAuditActorTypeSchema = z.enum(['user', 'system']);

export const ExamAuditActionSchema = z.enum([
  'create_exam',
  'publish_exam',
  'archive_exam',
  'cancel_exam',
  'reschedule_exam',
  'add_participant',
  'approve_participant',
  'reject_participant',
  'revoke_participant',
  'resend_invite',
  'send_invite',
  'bind_account',
  'merge_participants',
  'start_participation',
  'submit_participation',
  'auto_expire_session',
  'auto_expire_participation',
]);

export const AdminExamChallengeInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('existing'),
    challengeId: z.string().uuid('Invalid challenge ID format.'),
    orderIndex: z.number().int().min(0, 'Order index must be non-negative.').optional(),
  }),
  z.object({
    type: z.literal('new'),
    challenge: z.record(z.string(), z.unknown()),
    orderIndex: z.number().int().min(0, 'Order index must be non-negative.').optional(),
  }),
]);

const CreateAdminExamBaseSchema = z.object({
  title: z.string().min(1, 'Exam title is required.').max(255, 'Exam title is too long.'),
  slug: z
    .string()
    .min(3, 'Exam slug must be at least 3 characters.')
    .max(255, 'Exam slug is too long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Exam slug must use lowercase letters, numbers, and hyphens only.'),
  duration: z
    .number()
    .int()
    .min(1, 'Duration must be at least 1 minute.')
    .max(1440, 'Duration cannot exceed 1440 minutes (24 hours).'),
  startDate: z.string().datetime('Invalid start date format.'),
  endDate: z.string().datetime('Invalid end date format.'),
  isVisible: z.boolean().optional().default(false),
  maxAttempts: z.number().int().min(1, 'Max attempts must be at least 1.').optional().default(1),
  accessMode: ExamAccessModeSchema,
  selfRegistrationApprovalMode: SelfRegistrationApprovalModeSchema.nullable().optional().default(null),
  selfRegistrationPasswordRequired: z.boolean().optional().default(false),
  examPassword: z.string().max(255, 'Password is too long.').nullable().optional().default(null),
  allowExternalCandidates: z.boolean().optional().default(false),
  registrationOpenAt: z.string().datetime('Invalid registration open time.').nullable().optional().default(null),
  registrationCloseAt: z
    .string()
    .datetime('Invalid registration close time.')
    .nullable()
    .optional()
    .default(null),
  challenges: z
    .array(AdminExamChallengeInputSchema)
    .min(1, 'At least one challenge is required for an exam.'),
});

export const CreateAdminExamSchema = CreateAdminExamBaseSchema.superRefine((data, ctx) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (endDate <= startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'End date must be after start date.',
    });
  }

  if (data.accessMode === 'invite_only' && data.selfRegistrationApprovalMode !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selfRegistrationApprovalMode'],
      message: 'Invite-only exams cannot configure self-registration approval.',
    });
  }

  if (data.accessMode === 'invite_only' && data.selfRegistrationPasswordRequired) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selfRegistrationPasswordRequired'],
      message: 'Invite-only exams cannot require a registration password.',
    });
  }

  if (data.selfRegistrationPasswordRequired && !data.examPassword?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['examPassword'],
      message: 'Exam password is required when registration password is enabled.',
    });
  }

  if (data.accessMode !== 'invite_only' && data.selfRegistrationApprovalMode === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selfRegistrationApprovalMode'],
      message: 'Self-registration exams must declare an approval mode.',
    });
  }

  if (data.accessMode !== 'invite_only' && (!data.registrationOpenAt || !data.registrationCloseAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registrationOpenAt'],
      message: 'Self-registration exams must configure registration open and close times.',
    });
  }

  if (data.registrationOpenAt) {
    const registrationOpenAt = new Date(data.registrationOpenAt);
    if (registrationOpenAt >= startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationOpenAt'],
        message: 'Registration open time must be before the exam start time.',
      });
    }
  }

  if (data.registrationCloseAt) {
    const registrationCloseAt = new Date(data.registrationCloseAt);
    if (registrationCloseAt >= startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationCloseAt'],
        message: 'Registration close time must be before the exam start time.',
      });
    }
  }

  if (data.registrationOpenAt && data.registrationCloseAt) {
    const registrationOpenAt = new Date(data.registrationOpenAt);
    const registrationCloseAt = new Date(data.registrationCloseAt);
    if (registrationCloseAt <= registrationOpenAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationCloseAt'],
        message: 'Registration close time must be after registration open time.',
      });
    }
  }
});

export const UpdateAdminExamSchema = z.object({
  title: z.string().min(1, 'Exam title is required.').max(255, 'Exam title is too long.').optional(),
  slug: z
    .string()
    .min(3, 'Exam slug must be at least 3 characters.')
    .max(255, 'Exam slug is too long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Exam slug must use lowercase letters, numbers, and hyphens only.')
    .optional(),
  duration: z
    .number()
    .int()
    .min(1, 'Duration must be at least 1 minute.')
    .max(1440, 'Duration cannot exceed 1440 minutes (24 hours).')
    .optional(),
  startDate: z.string().datetime('Invalid start date format.').optional(),
  endDate: z.string().datetime('Invalid end date format.').optional(),
  isVisible: z.boolean().optional(),
  maxAttempts: z.number().int().min(1, 'Max attempts must be at least 1.').optional(),
  accessMode: ExamAccessModeSchema.optional(),
  selfRegistrationApprovalMode: SelfRegistrationApprovalModeSchema.nullable().optional(),
  selfRegistrationPasswordRequired: z.boolean().optional(),
  examPassword: z.string().max(255, 'Password is too long.').nullable().optional(),
  allowExternalCandidates: z.boolean().optional(),
  registrationOpenAt: z.string().datetime('Invalid registration open time.').nullable().optional(),
  registrationCloseAt: z
    .string()
    .datetime('Invalid registration close time.')
    .nullable()
    .optional(),
  challenges: z
    .array(
      z.object({
        challengeId: z.string().uuid('Invalid challenge ID format.'),
        orderIndex: z.number().int().min(0, 'Order index must be non-negative.'),
      }),
    )
    .min(1, 'At least one challenge is required for an exam.')
    .optional(),
});

export const PublicExamRegisterSchema = z.object({
  email: z.string().email('Invalid email format.'),
  fullName: z.string().min(1, 'Full name is required.').max(255, 'Full name is too long.'),
});

export const PublicExamInviteResolveSchema = z.object({
  inviteToken: z.string().min(1, 'Invite token is required.'),
});

export const PublicExamOtpSendSchema = z.object({
  email: z.string().email('Invalid email format.'),
});

export const PublicExamOtpVerifySchema = z.object({
  email: z.string().email('Invalid email format.'),
  otp: z.string().min(4, 'OTP is required.').max(10, 'OTP is too long.'),
});

export const ExamEntrySessionStartParamsSchema = z.object({
  id: z.string().uuid('Invalid entry session ID format.'),
});

export const ExamEntrySessionStartBodySchema = z.preprocess(
  value => value ?? {},
  z.object({
    examPassword: z.string().max(255, 'Password is too long.').optional(),
  }),
);

export const ExamSessionSyncSchema = z.union([
  z.object({
    participationId: z.string().uuid('Invalid participation ID format.'),
    answers: z.record(z.string(), z.unknown()),
  }),
  z.object({
    sessionId: z.string().min(1, 'Legacy session ID is required.'),
    answers: z.record(z.string(), z.unknown()),
    clientTimestamp: z.string().optional(),
  }),
]);

export const ExamSlugParamsSchema = z.object({
  slug: z.string().min(1, 'Exam slug is required.'),
});

export const ExamIdParamsSchema = z.object({
  id: z.string().uuid('Invalid exam ID format.'),
});

export const ExamParticipantParamsSchema = z.object({
  id: z.string().uuid('Invalid exam ID format.'),
  participantId: z.string().uuid('Invalid participant ID format.'),
});

export const AdminExamListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  createdBy: z.string().uuid('Invalid creator ID format.').optional(),
  search: z.string().optional(),
});

export const AdminExamParticipantInputSchema = z
  .object({
    email: z.string().email('Invalid email format.').optional(),
    fullName: z.string().min(1, 'Full name is required.').max(255).optional(),
    userId: z.string().uuid('Invalid user ID format.').optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'Either email or userId is required.',
      });
    }

    if (!data.fullName && !data.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fullName'],
        message: 'Full name is required when userId is not provided.',
      });
    }
  });

export const AdminExamAddParticipantsSchema = z.object({
  participants: z
    .array(AdminExamParticipantInputSchema)
    .min(1, 'At least one participant is required.'),
});

export const AdminExamBindAccountSchema = z.object({
  userId: z.string().uuid('Invalid user ID format.'),
});

export const AdminExamMergeParticipantsSchema = z.object({
  sourceParticipantId: z.string().uuid('Invalid source participant ID format.'),
  targetParticipantId: z.string().uuid('Invalid target participant ID format.'),
});

export type CreateAdminExamInput = z.infer<typeof CreateAdminExamSchema>;
export type UpdateAdminExamInput = z.infer<typeof UpdateAdminExamSchema>;
export type PublicExamRegisterInput = z.infer<typeof PublicExamRegisterSchema>;
export type PublicExamInviteResolveInput = z.infer<typeof PublicExamInviteResolveSchema>;
export type PublicExamOtpSendInput = z.infer<typeof PublicExamOtpSendSchema>;
export type PublicExamOtpVerifyInput = z.infer<typeof PublicExamOtpVerifySchema>;
export type ExamEntrySessionStartBodyInput = z.infer<
  typeof ExamEntrySessionStartBodySchema
>;
export type AdminExamAddParticipantsInput = z.infer<typeof AdminExamAddParticipantsSchema>;
