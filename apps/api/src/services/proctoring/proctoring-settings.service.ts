import { AppException } from '@backend/api/exceptions/base.exception';
import { AdminAuditLogRepository } from '@backend/api/repositories/adminAuditLog.repository';
import {
  createExamRepository,
  ExamRepository,
} from '@backend/api/repositories/exam.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
import {
  createProctoringModelRegistryService,
  ProctoringModelRegistryService,
} from './proctoring-model-registry.service';

import {
  ExamProctoringSettingsEntity,
  ExamProctoringSettingsInsert,
} from '@backend/shared/db/schema';
import { UpdateProctoringSettingsInput } from '@backend/shared/validations/proctoring.validation';

type ProctoringSettingsServiceDependencies = {
  settingsRepository: Pick<
    ProctoringSettingsRepository,
    'findByExamId' | 'upsertForExam'
  >;
  examRepository: Pick<ExamRepository, 'findBySlug' | 'findById'>;
  modelRegistryService?: Pick<ProctoringModelRegistryService, 'assertAiVisibilityGate'>;
  auditLogRepository?: Pick<AdminAuditLogRepository, 'create'>;
};

export type EffectiveProctoringSettings = Omit<
  ExamProctoringSettingsInsert,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export function buildDefaultProctoringSettings(examId: string): EffectiveProctoringSettings {
  return {
    examId,
    enabled: false,
    requireCamera: true,
    requireScreenShare: false,
    requireFullscreen: true,
    requireMonitorDisplaySurface: false,
    precheckValiditySeconds: 300,
    heartbeatIntervalSeconds: 10,
    missedHeartbeatGraceMultiplier: 3,
    screenShareResumeTimeoutSeconds: 30,
    fullscreenResumeTimeoutSeconds: 15,
    allowedEventTypesJson: [
      'heartbeat',
      'visibility_change',
      'fullscreen_change',
      'screen_share_change',
      'clipboard_event',
      'focus_change',
      'final_flush',
    ],
    riskWeightsJson: {},
    riskThresholdsJson: {},
    clipboardPolicy: 'log_only',
    aiAnomalyEnabled: true,
    aiShadowMode: true,
    aiAdvisoryVisible: false,
    aiMinimumEvaluationStatus: 'passed_gate',
    defaultAnomalyModelVersion: null,
    aiAnomalyThresholdsJson: {},
    shapExplanationsEnabled: true,
    shapMinimumRiskLevel: 'high',
    llmSummaryEnabled: false,
    llmSummaryProvider: null,
    llmSummaryModelVersion: null,
    llmSummaryPromptVersion: 'proctoring-summary-v1',
    llmSummaryJudgeEnabled: true,
    llmSummaryMinValidationScore: '0.85',
    llmSummaryRateLimitPerParticipation: 3,
    llmSummaryRateLimitWindowHours: 24,
    aiJobWindowSeconds: 300,
    consentNoticeVersion: 'phase-1-default',
    legalLinksJson: {},
    dataRetentionDays: 180,
    dataDeletionSlaDays: 20,
    sensitiveDataDeletionTargetHours: 72,
  };
}

function normalizeScreenShareSettings(
  settings: ExamProctoringSettingsInsert,
): void {
  if (!settings.requireScreenShare) {
    settings.requireMonitorDisplaySurface = false;
  }
}

function mergeWithDefaults(
  examId: string,
  existing?: Partial<ExamProctoringSettingsEntity> | null,
  patch: UpdateProctoringSettingsInput = {},
): ExamProctoringSettingsInsert {
  const defaults = buildDefaultProctoringSettings(examId);
  const merged = {
    ...defaults,
    ...(existing ?? {}),
    ...patch,
    examId,
  } as ExamProctoringSettingsInsert;
  normalizeScreenShareSettings(merged);
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateThresholds(
  value: unknown,
  defaults: { medium: number; high: number; critical: number },
  range: { min: number; max: number },
): void {
  const thresholds = {
    ...defaults,
    ...(isRecord(value) ? value : {}),
  };
  const values = (['medium', 'high', 'critical'] as const).map(key => thresholds[key]);
  if (
    values.some(threshold => typeof threshold !== 'number' || !Number.isFinite(threshold)) ||
    values.some(threshold => threshold < range.min || threshold > range.max)
  ) {
    throw new AppException(
      'Proctoring thresholds are invalid.',
      400,
      'PROCTORING_THRESHOLD_POLICY_INVALID',
    );
  }
  if (!(values[0]! < values[1]! && values[1]! < values[2]!)) {
    throw new AppException(
      'Proctoring thresholds must satisfy medium < high < critical.',
      400,
      'PROCTORING_THRESHOLD_POLICY_INVALID',
    );
  }
}

function validateThresholdPolicy(settings: ExamProctoringSettingsInsert): void {
  validateThresholds(
    settings.riskThresholdsJson,
    { medium: 25, high: 50, critical: 85 },
    { min: 0, max: 100 },
  );
  validateThresholds(
    settings.aiAnomalyThresholdsJson,
    { medium: 0.5, high: 0.7, critical: 0.9 },
    { min: 0, max: 1 },
  );
}

const auditedAiSettingKeys = [
  'aiAdvisoryVisible',
  'aiMinimumEvaluationStatus',
  'defaultAnomalyModelVersion',
  'aiAnomalyThresholdsJson',
  'riskThresholdsJson',
  'riskWeightsJson',
  'llmSummaryEnabled',
  'llmSummaryProvider',
  'llmSummaryModelVersion',
  'llmSummaryPromptVersion',
  'llmSummaryJudgeEnabled',
  'llmSummaryMinValidationScore',
  'llmSummaryRateLimitPerParticipation',
  'llmSummaryRateLimitWindowHours',
] as const;

const auditedAiSettingKeySet = new Set<string>(auditedAiSettingKeys);

function touchesAuditedAiSettings(patch: UpdateProctoringSettingsInput): boolean {
  return Object.keys(patch).some(key => auditedAiSettingKeySet.has(key));
}

export class ProctoringSettingsService {
  private readonly modelRegistryService: Pick<ProctoringModelRegistryService, 'assertAiVisibilityGate'>;
  private readonly auditLogRepository: Pick<AdminAuditLogRepository, 'create'>;

  constructor(private readonly deps: ProctoringSettingsServiceDependencies) {
    this.modelRegistryService = deps.modelRegistryService ?? createProctoringModelRegistryService();
    this.auditLogRepository = deps.auditLogRepository ?? new AdminAuditLogRepository();
  }

  async getSettingsBySlug(slug: string, _userId?: string | null): Promise<EffectiveProctoringSettings> {
    const exam = await this.deps.examRepository.findBySlug(slug);
    if (!exam) {
      throw new AppException('Exam not found', 404, 'EXAM_NOT_FOUND');
    }

    return this.getSettingsByExamId(exam.id);
  }

  async getSettingsByExamId(examId: string): Promise<EffectiveProctoringSettings> {
    const existing = await this.deps.settingsRepository.findByExamId(examId);
    return mergeWithDefaults(examId, existing);
  }

  async updateSettings(
    examId: string,
    _actorId: string | undefined,
    patch: UpdateProctoringSettingsInput,
  ): Promise<ExamProctoringSettingsEntity> {
    const exam = await this.deps.examRepository.findById(examId);
    if (!exam) {
      throw new AppException('Exam not found', 404, 'EXAM_NOT_FOUND');
    }

    const existing = await this.deps.settingsRepository.findByExamId(examId);
    const merged = mergeWithDefaults(examId, existing, patch);

    validateThresholdPolicy(merged);

    if (merged.aiAdvisoryVisible) {
      await this.modelRegistryService.assertAiVisibilityGate({
        modelVersion: merged.defaultAnomalyModelVersion ?? null,
        minimumEvaluationStatus: 'passed_gate',
      });
    }

    if (merged.llmSummaryEnabled) {
      throw new AppException(
        'LLM summary visibility is not enabled without explicit privacy approval.',
        400,
        'PROCTORING_LLM_PRIVACY_GATE_NOT_APPROVED'
      );
    }

    const updated = await this.deps.settingsRepository.upsertForExam(merged);
    if (touchesAuditedAiSettings(patch)) {
      await this.auditLogRepository.create({
        actorType: _actorId ? 'user' : 'system',
        actorId: _actorId ?? null,
        action: 'proctoring_settings_ai_update',
        targetType: 'exam',
        targetId: examId,
        metadata: {
          changedKeys: Object.keys(patch).filter(key => auditedAiSettingKeySet.has(key)),
          aiAdvisoryVisible: updated.aiAdvisoryVisible,
          defaultAnomalyModelVersion: updated.defaultAnomalyModelVersion,
        },
      });
    }

    return updated;
  }
}

export function createProctoringSettingsService(): ProctoringSettingsService {
  return new ProctoringSettingsService({
    settingsRepository: new ProctoringSettingsRepository(),
    examRepository: createExamRepository(),
  });
}
