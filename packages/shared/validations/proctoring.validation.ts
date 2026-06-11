import { z } from 'zod';

const uuidMessage = 'Invalid UUID format.';

export const ProctoringSlugParamsSchema = z.object({
  slug: z
    .string()
    .min(1, 'Exam slug is required.')
    .max(255, 'Exam slug is too long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Exam slug must use lowercase letters, numbers, and hyphens only.'),
});

export const ProctoringExamIdParamsSchema = z.object({
  examId: z.string().uuid(uuidMessage),
});

export const ProctoringParticipationIdParamsSchema = z.object({
  participationId: z.string().uuid(uuidMessage),
});

export const ProctoringAdminBypassParamsSchema = z.object({
  examId: z.string().uuid(uuidMessage),
  participationId: z.string().uuid(uuidMessage),
});

export const ClientSessionIdSchema = z
  .string()
  .min(1, 'Client session ID is required.')
  .max(100, 'Client session ID is too long.');

export const ProctoringDisplaySurfaceSchema = z.enum([
  'monitor',
  'window',
  'browser',
  'surface_unknown',
]);

export const ProctoringDataRequestTypeSchema = z.enum([
  'withdraw_consent',
  'delete',
  'restrict',
  'anonymize',
]);

function requireEntryOrParticipation(
  value: { entrySessionId?: string; participationId?: string },
  ctx: z.RefinementCtx,
): void {
  if (!value.entrySessionId && !value.participationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either entrySessionId or participationId is required.',
      path: ['participationId'],
    });
  }
}

export const CreateProctoringConsentSchema = z.object({
  accepted: z.literal(true, {
    error: 'Consent must be explicitly accepted.',
  }),
  clientSessionId: ClientSessionIdSchema,
  entrySessionId: z.string().uuid(uuidMessage).optional(),
  participationId: z.string().uuid(uuidMessage).optional(),
  acceptedCapabilitiesJson: z.record(z.string(), z.boolean()).default({}),
});

export const CreateProctoringPrecheckSchema = z.object({
  consentRecordId: z.string().uuid(uuidMessage),
  clientSessionId: ClientSessionIdSchema,
  browserName: z.string().max(80).optional(),
  browserVersion: z.string().max(80).optional(),
  osName: z.string().max(80).optional(),
  getUserMediaSupported: z.boolean(),
  cameraPermissionGranted: z.boolean(),
  getDisplayMediaSupported: z.boolean(),
  displaySurface: ProctoringDisplaySurfaceSchema.optional(),
  monitorValidated: z.boolean().optional().default(false),
  fullscreenSupported: z.boolean(),
  browserSupported: z.boolean(),
});

export const VerifyProctoringBypassSchema = z
  .object({
    bypassCode: z.string().min(4, 'Bypass code is required.').max(128, 'Bypass code is too long.'),
    clientSessionId: ClientSessionIdSchema,
    entrySessionId: z.string().uuid(uuidMessage).optional(),
    participationId: z.string().uuid(uuidMessage).optional(),
  })
  .superRefine(requireEntryOrParticipation);

export const CreateProctoringDataRequestSchema = z.object({
  requestType: ProctoringDataRequestTypeSchema,
  statutoryDueAt: z.string().datetime('Invalid statutory due date.'),
  reason: z.string().max(1000, 'Reason is too long.').optional(),
});

export const UpdateProctoringSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  requireCamera: z.boolean().optional(),
  requireScreenShare: z.boolean().optional(),
  requireFullscreen: z.boolean().optional(),
  requireMonitorDisplaySurface: z.boolean().optional(),
  precheckValiditySeconds: z.number().int().min(30).max(3600).optional(),
  heartbeatIntervalSeconds: z.number().int().min(1).max(120).optional(),
  missedHeartbeatGraceMultiplier: z.number().int().min(1).max(20).optional(),
  screenShareResumeTimeoutSeconds: z.number().int().min(1).max(600).optional(),
  fullscreenResumeTimeoutSeconds: z.number().int().min(1).max(600).optional(),
  allowedEventTypesJson: z.array(z.string().min(1).max(80)).optional(),
  riskWeightsJson: z.record(z.string(), z.number()).optional(),
  riskThresholdsJson: z.record(z.string(), z.number()).optional(),
  clipboardPolicy: z.enum(['log_only', 'block', 'ignore']).optional(),
  aiAnomalyEnabled: z.boolean().optional(),
  aiShadowMode: z.boolean().optional(),
  aiJobWindowSeconds: z.number().int().min(60).max(3600).optional(),
  consentNoticeVersion: z.string().min(1).max(50).optional(),
  legalLinksJson: z.record(z.string(), z.string()).optional(),
  dataRetentionDays: z.number().int().min(1).max(3650).optional(),
  dataDeletionSlaDays: z.number().int().min(1).max(365).optional(),
  sensitiveDataDeletionTargetHours: z.number().int().min(1).max(168).optional(),
});

export const IssueProctoringBypassCodeSchema = z.object({
  clientSessionId: ClientSessionIdSchema,
  entrySessionId: z.string().uuid(uuidMessage).optional(),
  reason: z.string().min(1, 'Reason is required.').max(500, 'Reason is too long.'),
  expiresAt: z.string().datetime('Invalid bypass expiry.').optional(),
});

export type CreateProctoringConsentInput = z.infer<typeof CreateProctoringConsentSchema>;
export type CreateProctoringPrecheckInput = z.infer<typeof CreateProctoringPrecheckSchema>;
export type VerifyProctoringBypassInput = z.infer<typeof VerifyProctoringBypassSchema>;
export type CreateProctoringDataRequestInput = z.infer<typeof CreateProctoringDataRequestSchema>;
export type UpdateProctoringSettingsInput = z.infer<typeof UpdateProctoringSettingsSchema>;
export type IssueProctoringBypassCodeInput = z.infer<typeof IssueProctoringBypassCodeSchema>;
