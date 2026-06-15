import {
  ExamProctoringAnomalyResultInsert,
  ProctoringAiJobEntity,
} from '@backend/shared/db/schema';
import { ProctoringAnomalyResultRepository } from '@backend/shared/db/repositories/proctoringAnomalyResult.repository';
import { ProctoringLlmSummaryRepository } from '@backend/shared/db/repositories/proctoringLlmSummary.repository';

import {
  ProctoringAiExplanation,
  ProctoringAiPrediction,
  ProctoringLlmSummaryResponse,
} from './proctoring-ai-http-client';

type ProctoringAiResultWriterDependencies = {
  anomalyResultRepository?: Pick<
    ProctoringAnomalyResultRepository,
    'upsertByWindowModel' | 'updateExplanationStatus'
  >;
  llmSummaryRepository?: Pick<any, 'updateStatus'>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringFrom(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function safeSummaryFailureCode(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes('disabled')) {
    return 'provider_disabled';
  }
  if (normalized.includes('timeout')) {
    return 'provider_timeout';
  }
  if (
    normalized.includes('provider') ||
    normalized.includes('server-ai') ||
    normalized.includes('unavailable') ||
    normalized.includes('network') ||
    normalized.includes('fetch')
  ) {
    return 'provider_failed';
  }
  return 'summary_generation_failed';
}

function sanitizeTopContributors(value: unknown): ExamProctoringAnomalyResultInsert['topContributorsJson'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!isRecord(item)) {
      return [];
    }
    const featureName = item.featureName;
    const numericValue = item.numericValue;
    const contribution = item.contribution;
    const direction = item.direction;
    const displayLabel = item.displayLabel;
    if (
      typeof featureName !== 'string' ||
      typeof numericValue !== 'number' ||
      typeof contribution !== 'number' ||
      (direction !== 'increased_risk' && direction !== 'decreased_risk') ||
      typeof displayLabel !== 'string'
    ) {
      return [];
    }

    return [
      {
        featureName,
        numericValue,
        contribution,
        direction,
        displayLabel,
      },
    ];
  });
}

function buildSourceEventRange(job: ProctoringAiJobEntity): Record<string, unknown> {
  const payload = isRecord(job.payloadJson) ? job.payloadJson : {};
  const context = isRecord(payload.context) ? payload.context : {};
  const sourceEventRange = isRecord(payload.sourceEventRangeJson)
    ? payload.sourceEventRangeJson
    : isRecord(context.sourceEventRangeJson)
      ? context.sourceEventRangeJson
      : {};

  return {
    ...sourceEventRange,
    windowStart: job.windowStart.toISOString(),
    windowEnd: job.windowEnd.toISOString(),
  };
}

export class ProctoringAiResultWriterService {
  private readonly anomalyResultRepository: Pick<
    ProctoringAnomalyResultRepository,
    'upsertByWindowModel' | 'updateExplanationStatus'
  >;
  private readonly llmSummaryRepository: Pick<any, 'updateStatus'>;

  constructor(deps: ProctoringAiResultWriterDependencies = {}) {
    this.anomalyResultRepository =
      deps.anomalyResultRepository ?? new ProctoringAnomalyResultRepository();
    this.llmSummaryRepository = deps.llmSummaryRepository ?? new ProctoringLlmSummaryRepository();
  }

  async persistPrediction(input: {
    job: ProctoringAiJobEntity;
    prediction: ProctoringAiPrediction;
    completedAt: Date;
  }) {
    const payload = isRecord(input.job.payloadJson) ? input.job.payloadJson : {};
    const featureSchemaVersion = stringFrom(
      input.job.featureSchemaVersion,
      stringFrom(payload.featureSchemaVersion, 'browser-window-v1')
    );
    const scoringSchemaVersion = stringFrom(
      input.job.scoringSchemaVersion,
      stringFrom(payload.scoringSchemaVersion, 'anomaly-score-v1')
    );
    const explanationStatus = stringFrom(
      input.prediction.explanationStatus,
      input.prediction.riskLevel === 'high' || input.prediction.riskLevel === 'critical'
        ? 'pending'
        : 'not_requested'
    );

    return this.anomalyResultRepository.upsertByWindowModel({
      examId: input.job.examId,
      participationId: input.job.participationId,
      sessionId: input.job.sessionId,
      jobId: input.job.id,
      windowId: input.prediction.windowId,
      windowStart: input.job.windowStart,
      windowEnd: input.job.windowEnd,
      modelVersion: input.prediction.modelVersion,
      featureSchemaVersion,
      scoringSchemaVersion,
      anomalyScore: input.prediction.anomalyScore,
      rawScore: input.prediction.rawScore,
      riskLevel: input.prediction.riskLevel,
      explanationStatus,
      topContributorsJson: sanitizeTopContributors(input.prediction.topContributors),
      explanationSkippedReason: null,
      sourceEventRangeJson: buildSourceEventRange(input.job),
      createdAt: input.completedAt,
      updatedAt: input.completedAt,
      explainedAt: explanationStatus === 'completed' ? input.completedAt : null,
    });
  }

  async persistExplanation(input: {
    job: ProctoringAiJobEntity;
    explanation: ProctoringAiExplanation;
    completedAt: Date;
  }) {
    return this.anomalyResultRepository.updateExplanationStatus({
      participationId: input.job.participationId,
      windowId: input.explanation.windowId,
      modelVersion: input.explanation.modelVersion,
      explanationStatus: input.explanation.explanationStatus,
      explanationSkippedReason:
        input.explanation.explanationStatus === 'completed'
          ? null
          : 'server-ai explanation incomplete',
      topContributorsJson: input.explanation.topContributors,
      explainedAt: input.explanation.explanationStatus === 'completed' ? input.completedAt : null,
    });
  }

  async markExplanationFailed(input: {
    job: ProctoringAiJobEntity;
    reason: string;
  }) {
    const payload = isRecord(input.job.payloadJson) ? input.job.payloadJson : {};
    const telemetry = isRecord(payload.telemetry) ? payload.telemetry : {};
    const windowId = stringFrom(telemetry.windowId, '');
    const modelVersion = stringFrom(payload.modelVersion, stringFrom(input.job.modelVersion, ''));
    if (!windowId || !modelVersion) {
      return null;
    }

    return this.anomalyResultRepository.updateExplanationStatus({
      participationId: input.job.participationId,
      windowId,
      modelVersion,
      explanationStatus: 'failed',
      explanationSkippedReason: input.reason,
      explainedAt: null,
    });
  }

  async persistSummary(input: {
    job: ProctoringAiJobEntity;
    summary: ProctoringLlmSummaryResponse;
    completedAt: Date;
  }) {
    const payload = isRecord(input.job.payloadJson) ? input.job.payloadJson : {};
    const llmSummaryId = stringFrom(payload.llmSummaryId, '');
    if (!llmSummaryId) {
      return null;
    }
    const accepted = input.summary.validationStatus === 'passed';
    return this.llmSummaryRepository.updateStatus(llmSummaryId, {
      status: accepted ? 'accepted' : 'validation_failed',
      validationStatus: input.summary.validationStatus,
      validationScore: input.summary.validationScore,
      validationErrorsJson: input.summary.validationErrors ?? [],
      summaryJson: accepted ? { summaryText: input.summary.summaryText } : null,
      riskFactsJson: accepted ? input.summary.riskFacts : null,
      missingDataNotesJson: accepted ? input.summary.missingDataNotes : null,
      modelNotesJson: accepted ? input.summary.modelNotes : null,
      sourceEventIdsJson: accepted
        ? input.summary.citations.map(citation => citation.eventId)
        : [],
      completedAt: input.completedAt,
    });
  }

  async markSummaryFailed(input: {
    job: ProctoringAiJobEntity;
    reason: string;
    status?: 'provider_failed' | 'dead_letter';
  }) {
    const payload = isRecord(input.job.payloadJson) ? input.job.payloadJson : {};
    const llmSummaryId = stringFrom(payload.llmSummaryId, '');
    if (!llmSummaryId) {
      return null;
    }
    const status = input.status ?? 'provider_failed';
    return this.llmSummaryRepository.updateStatus(llmSummaryId, {
      status,
      validationStatus: 'failed',
      validationScore: null,
      validationErrorsJson: [safeSummaryFailureCode(input.reason)],
      summaryJson: null,
      riskFactsJson: null,
      missingDataNotesJson: null,
      modelNotesJson: null,
      sourceEventIdsJson: [],
      completedAt: new Date(),
    });
  }
}
