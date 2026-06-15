import { ProctoringAiJobRepository } from '@backend/api/repositories/proctoring/proctoringAiJob.repository';
import { ProctoringEventRepository } from '@backend/api/repositories/proctoring/proctoringEvent.repository';
import { ProctoringSummaryRepository } from '@backend/api/repositories/proctoring/proctoringSummary.repository';
import {
  ExamProctoringEventEntity,
  ExamProctoringSummaryEntity,
  ExamProctoringSummaryInsert,
} from '@backend/shared/db/schema';

import { ProctoringRiskService } from './proctoring-risk.service';
import {
  createProctoringThresholdService,
  ProctoringThresholdService,
} from './proctoring-threshold.service';

export const DETERMINISTIC_RISK_SCHEMA_VERSION = 'phase-1-deterministic-risk-v1';

export type ProctoringSummaryRecomputeInput = {
  participationId: string;
  finalFlushStatus?: string | null;
  now?: Date;
  reviewPolicy?: {
    needsReReview?: boolean;
  };
};

type ProctoringSummaryServiceDependencies = {
  eventRepository?: Pick<ProctoringEventRepository, 'findByParticipationOrderedByCapturedAt'>;
  summaryRepository?: Pick<ProctoringSummaryRepository, 'upsertComputedForParticipation'>;
  aiJobRepository?: Pick<ProctoringAiJobRepository, 'findByParticipation'>;
  riskService?: ProctoringRiskService;
  thresholdService?: Pick<ProctoringThresholdService, 'loadPolicyForExam'>;
};

function maxDate(
  events: ExamProctoringEventEntity[],
  key: 'capturedAt' | 'receivedAt'
): Date | null {
  if (events.length === 0) {
    return null;
  }
  return events.reduce(
    (latest, event) => (event[key] > latest ? event[key] : latest),
    events[0]![key]
  );
}

export class ProctoringSummaryService {
  private readonly eventRepository: Pick<
    ProctoringEventRepository,
    'findByParticipationOrderedByCapturedAt'
  >;
  private readonly summaryRepository: Pick<
    ProctoringSummaryRepository,
    'upsertComputedForParticipation'
  >;
  private readonly riskService: ProctoringRiskService;
  private readonly thresholdService: Pick<ProctoringThresholdService, 'loadPolicyForExam'>;

  constructor(deps: ProctoringSummaryServiceDependencies = {}) {
    this.eventRepository = deps.eventRepository ?? new ProctoringEventRepository();
    this.summaryRepository = deps.summaryRepository ?? new ProctoringSummaryRepository();
    this.riskService = deps.riskService ?? new ProctoringRiskService();
    this.thresholdService = deps.thresholdService ?? createProctoringThresholdService();
    void deps.aiJobRepository;
  }

  async recomputeForParticipation(
    input: ProctoringSummaryRecomputeInput
  ): Promise<ExamProctoringSummaryEntity> {
    const events = await this.eventRepository.findByParticipationOrderedByCapturedAt(
      input.participationId
    );
    if (events.length === 0) {
      throw new Error(
        `Cannot recompute proctoring summary without persisted events for participation ${input.participationId}`
      );
    }

    const first = events[0]!;
    const thresholdPolicy = await this.thresholdService.loadPolicyForExam(first.examId);
    const risk = this.riskService.compute(events, thresholdPolicy.deterministic);
    const values: ExamProctoringSummaryInsert = {
      examId: first.examId,
      participationId: first.participationId,
      sessionId: first.sessionId,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      eventCountsJson: risk.eventCountsJson,
      velocityJson: risk.velocityJson,
      finalFlushStatus: input.finalFlushStatus ?? null,
      lastEventCapturedAt: maxDate(events, 'capturedAt'),
      lastEventReceivedAt: maxDate(events, 'receivedAt'),
      deterministicSchemaVersion:
        thresholdPolicy.scoringSchemaVersion ?? DETERMINISTIC_RISK_SCHEMA_VERSION,
      computedAt: input.now ?? new Date(),
      reviewerDecision: input.reviewPolicy?.needsReReview ? 'needs_re_review' : 'pending',
    };

    return this.summaryRepository.upsertComputedForParticipation(values, {
      preserveReviewerDecision: !input.reviewPolicy?.needsReReview,
    });
  }
}

export function createProctoringSummaryService(): ProctoringSummaryService {
  return new ProctoringSummaryService();
}
