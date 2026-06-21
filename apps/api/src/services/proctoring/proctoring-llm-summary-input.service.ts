import crypto from 'node:crypto';

import { ProctoringEventRepository } from '@backend/api/repositories/proctoring/proctoringEvent.repository';
import { ProctoringReviewLabelRepository } from '@backend/api/repositories/proctoring/proctoringReviewLabel.repository';
import { ProctoringSummaryRepository } from '@backend/api/repositories/proctoring/proctoringSummary.repository';
import { ProctoringAnomalyResultRepository } from '@backend/shared/db/repositories/proctoringAnomalyResult.repository';

export type ProctoringLlmSummaryInput = {
  schemaVersion: 'proctoring-summary-input-v1';
  examId: string;
  participationId: string;
  deterministicSummaryId: string | null;
  generatedAt: string;
  timeline: Array<{
    eventId: string;
    eventName: string;
    type: string;
    severity: string;
    capturedAt: string | null;
    durationMs: number | null;
  }>;
  riskFacts: Array<{
    type: string;
    count: number;
    totalDurationMs: number;
    evidenceEventIds: string[];
  }>;
  anomalyFacts: Array<{
    windowId: string;
    modelVersion: string;
    anomalyScore: number;
    riskLevel: string;
    sourceEventIds: string[];
  }>;
  reviewFacts: {
    finalFlushStatus: string | null;
    reviewerDecision: string | null;
    reviewLabelOutcome: string | null;
  };
  missingDataNotes: string[];
};

type Dependencies = {
  eventRepository?: Pick<ProctoringEventRepository, 'findByParticipationOrderedByCapturedAt'>;
  summaryRepository?: Pick<ProctoringSummaryRepository, 'findByParticipation'>;
  anomalyResultRepository?: Pick<ProctoringAnomalyResultRepository, 'findLatestByParticipation'>;
  reviewLabelRepository?: Pick<ProctoringReviewLabelRepository, 'findByParticipation'>;
  nowFactory?: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function eventIdsFromRange(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const ids = value.eventIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeys(value[key]);
      return acc;
    }, {});
}

function canonicalHash(input: ProctoringLlmSummaryInput): string {
  const { generatedAt: _generatedAt, ...hashInput } = input;
  const json = JSON.stringify(sortKeys(hashInput));
  return crypto.createHash('sha256').update(json, 'utf8').digest('hex');
}

export class ProctoringLlmSummaryInputService {
  private readonly eventRepository: Pick<
    ProctoringEventRepository,
    'findByParticipationOrderedByCapturedAt'
  >;
  private readonly summaryRepository: Pick<ProctoringSummaryRepository, 'findByParticipation'>;
  private readonly anomalyResultRepository: Pick<
    ProctoringAnomalyResultRepository,
    'findLatestByParticipation'
  >;
  private readonly reviewLabelRepository: Pick<
    ProctoringReviewLabelRepository,
    'findByParticipation'
  >;
  private readonly nowFactory: () => Date;

  constructor(deps: Dependencies = {}) {
    this.eventRepository = deps.eventRepository ?? new ProctoringEventRepository();
    this.summaryRepository = deps.summaryRepository ?? new ProctoringSummaryRepository();
    this.anomalyResultRepository =
      deps.anomalyResultRepository ?? new ProctoringAnomalyResultRepository();
    this.reviewLabelRepository = deps.reviewLabelRepository ?? new ProctoringReviewLabelRepository();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
  }

  async buildInput(input: { examId: string; participationId: string }): Promise<{
    input: ProctoringLlmSummaryInput;
    inputHash: string;
  }> {
    const [events, summary, anomalyResults, labels] = await Promise.all([
      this.eventRepository.findByParticipationOrderedByCapturedAt(input.participationId),
      this.summaryRepository.findByParticipation(input.participationId),
      this.anomalyResultRepository.findLatestByParticipation(input.participationId),
      this.reviewLabelRepository.findByParticipation(input.participationId),
    ]);

    const timeline = events
      .map(event => {
        const payload = isRecord(event.payloadJson) ? event.payloadJson : {};
        return {
          eventId: event.id,
          eventName: stringValue(payload.eventName, event.type),
          type: event.type,
          severity: event.severity,
          capturedAt: event.capturedAt ? event.capturedAt.toISOString() : null,
          durationMs: numberValue(payload.durationMs),
        };
      })
      .sort((a, b) => {
        const captured = String(a.capturedAt ?? '').localeCompare(String(b.capturedAt ?? ''));
        return captured || a.eventId.localeCompare(b.eventId);
      });

    const eventCounts = isRecord(summary?.eventCountsJson) ? summary.eventCountsJson : {};
    const riskFacts = Object.entries(eventCounts).map(([type, count]) => ({
      type,
      count: typeof count === 'number' ? count : 0,
      totalDurationMs: 0,
      evidenceEventIds: timeline
        .filter(event => event.type === type || event.eventName === type)
        .map(event => event.eventId),
    }));

    const latestLabel = labels[0] ?? null;
    const built: ProctoringLlmSummaryInput = {
      schemaVersion: 'proctoring-summary-input-v1',
      examId: input.examId,
      participationId: input.participationId,
      deterministicSummaryId: summary?.id ?? null,
      generatedAt: this.nowFactory().toISOString(),
      timeline,
      riskFacts,
      anomalyFacts: anomalyResults.map(result => ({
        windowId: result.windowId,
        modelVersion: result.modelVersion,
        anomalyScore: Number(result.anomalyScore),
        riskLevel: result.riskLevel,
        sourceEventIds: eventIdsFromRange(result.sourceEventRangeJson),
      })),
      reviewFacts: {
        finalFlushStatus: summary?.finalFlushStatus ?? null,
        reviewerDecision: summary?.reviewerDecision ?? null,
        reviewLabelOutcome: latestLabel?.reviewOutcome ?? null,
      },
      missingDataNotes: [
        ...(events.length === 0 ? ['no_timeline_events'] : []),
        ...(!summary ? ['no_deterministic_summary'] : []),
        ...(anomalyResults.length === 0 ? ['no_anomaly_facts'] : []),
      ],
    };

    return {
      input: built,
      inputHash: canonicalHash(built),
    };
  }
}

export function createProctoringLlmSummaryInputService(): ProctoringLlmSummaryInputService {
  return new ProctoringLlmSummaryInputService();
}
