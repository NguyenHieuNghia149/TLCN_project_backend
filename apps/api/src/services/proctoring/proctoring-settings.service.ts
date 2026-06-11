import { AppException } from '@backend/api/exceptions/base.exception';
import {
  createExamRepository,
  ExamRepository,
} from '@backend/api/repositories/exam.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
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
    requireScreenShare: true,
    requireFullscreen: true,
    requireMonitorDisplaySurface: true,
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
    aiJobWindowSeconds: 300,
    consentNoticeVersion: 'phase-1-default',
    legalLinksJson: {},
    dataRetentionDays: 180,
    dataDeletionSlaDays: 20,
    sensitiveDataDeletionTargetHours: 72,
  };
}

function mergeWithDefaults(
  examId: string,
  existing?: Partial<ExamProctoringSettingsEntity> | null,
  patch: UpdateProctoringSettingsInput = {},
): ExamProctoringSettingsInsert {
  const defaults = buildDefaultProctoringSettings(examId);
  return {
    ...defaults,
    ...(existing ?? {}),
    ...patch,
    examId,
  } as ExamProctoringSettingsInsert;
}

export class ProctoringSettingsService {
  constructor(private readonly deps: ProctoringSettingsServiceDependencies) {}

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
    return this.deps.settingsRepository.upsertForExam(mergeWithDefaults(examId, existing, patch));
  }
}

export function createProctoringSettingsService(): ProctoringSettingsService {
  return new ProctoringSettingsService({
    settingsRepository: new ProctoringSettingsRepository(),
    examRepository: createExamRepository(),
  });
}
