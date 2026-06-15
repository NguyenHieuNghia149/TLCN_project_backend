import { AppException } from '@backend/api/exceptions/base.exception';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';

import { ProctoringRiskPolicy } from './proctoring-risk.service';
import { buildDefaultProctoringSettings } from './proctoring-settings.service';

export const PROCTORING_THRESHOLD_SCORING_SCHEMA_VERSION = 'phase-2-threshold-policy-v1';

type ThresholdServiceDependencies = {
  settingsRepository?: Pick<ProctoringSettingsRepository, 'findByExamId'>;
};

type Thresholds = {
  medium: number;
  high: number;
  critical: number;
};

const DEFAULT_DETERMINISTIC_THRESHOLDS: Thresholds = {
  medium: 25,
  high: 50,
  critical: 85,
};

const DEFAULT_ANOMALY_THRESHOLDS: Thresholds = {
  medium: 0.5,
  high: 0.7,
  critical: 0.9,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
  );
}

function normalizeThresholds(
  value: unknown,
  defaults: Thresholds,
  range: { min: number; max: number }
): Thresholds {
  const merged = {
    ...defaults,
    ...numberRecord(value),
  };
  for (const [key, threshold] of Object.entries(merged)) {
    if (!Number.isFinite(threshold) || threshold < range.min || threshold > range.max) {
      throw new AppException(
        `Invalid proctoring threshold ${key}.`,
        400,
        'PROCTORING_THRESHOLD_POLICY_INVALID'
      );
    }
  }
  if (!(merged.medium < merged.high && merged.high < merged.critical)) {
    throw new AppException(
      'Proctoring thresholds must satisfy medium < high < critical.',
      400,
      'PROCTORING_THRESHOLD_POLICY_INVALID'
    );
  }
  return merged;
}

export class ProctoringThresholdService {
  private readonly settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;

  constructor(deps: ThresholdServiceDependencies = {}) {
    this.settingsRepository = deps.settingsRepository ?? new ProctoringSettingsRepository();
  }

  async loadPolicyForExam(examId: string): Promise<{
    deterministic: ProctoringRiskPolicy;
    anomalyThresholds: Thresholds;
    scoringSchemaVersion: string;
  }> {
    const settings =
      (await this.settingsRepository.findByExamId(examId)) ?? buildDefaultProctoringSettings(examId);
    const deterministicThresholds = normalizeThresholds(
      settings.riskThresholdsJson,
      DEFAULT_DETERMINISTIC_THRESHOLDS,
      { min: 0, max: 100 }
    );
    const anomalyThresholds = normalizeThresholds(
      settings.aiAnomalyThresholdsJson,
      DEFAULT_ANOMALY_THRESHOLDS,
      { min: 0, max: 1 }
    );

    return {
      deterministic: {
        eventWeights: numberRecord(settings.riskWeightsJson),
        riskThresholds: deterministicThresholds,
      },
      anomalyThresholds,
      scoringSchemaVersion: PROCTORING_THRESHOLD_SCORING_SCHEMA_VERSION,
    };
  }
}

export function createProctoringThresholdService(): ProctoringThresholdService {
  return new ProctoringThresholdService();
}
