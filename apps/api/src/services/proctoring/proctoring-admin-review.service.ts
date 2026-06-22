import { AppException } from '@backend/api/exceptions/base.exception';
import { ExamAuditLogRepository } from '@backend/api/repositories/examAuditLog.repository';
import {
  createExamRepository,
  ExamRepository,
} from '@backend/api/repositories/exam.repository';
import { ExamParticipationRepository } from '@backend/api/repositories/examParticipation.repository';
import { ProctoringBypassRepository } from '@backend/api/repositories/proctoring/proctoringBypass.repository';
import { ProctoringConsentRepository } from '@backend/api/repositories/proctoring/proctoringConsent.repository';
import { ProctoringDataRequestRepository } from '@backend/api/repositories/proctoring/proctoringDataRequest.repository';
import { ProctoringEventRepository } from '@backend/api/repositories/proctoring/proctoringEvent.repository';
import { ProctoringFinalFlushRepository } from '@backend/api/repositories/proctoring/proctoringFinalFlush.repository';
import { ProctoringPrecheckRepository } from '@backend/api/repositories/proctoring/proctoringPrecheck.repository';
import { ProctoringEvaluationReportRepository } from '@backend/api/repositories/proctoring/proctoringEvaluationReport.repository';
import { ProctoringReviewLabelRepository } from '@backend/api/repositories/proctoring/proctoringReviewLabel.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
import { ProctoringSummaryRepository } from '@backend/api/repositories/proctoring/proctoringSummary.repository';
import { ProctoringAnomalyResultRepository } from '@backend/shared/db/repositories/proctoringAnomalyResult.repository';
import { ProctoringLlmSummaryRepository } from '@backend/shared/db/repositories/proctoringLlmSummary.repository';
import { ExamProctoringSettingsEntity } from '@backend/shared/db/schema';
import {
  AdminProctoringReviewQueryInput,
  RecordProctoringReviewLabelInput,
  RecomputeProctoringReviewInput,
  ReviewProctoringDecisionInput,
} from '@backend/shared/validations/proctoring.validation';

import {
  createProctoringAiJobService,
  ProctoringAiJobService,
} from './proctoring-ai-job.service';
import {
  createProctoringModelRegistryService,
  ProctoringModelRegistryService,
} from './proctoring-model-registry.service';
import {
  createProctoringSummaryService,
  ProctoringSummaryService,
} from './proctoring-summary.service';

type AdminReviewDependencies = {
  examRepository?: Pick<ExamRepository, 'findById'>;
  participationRepository?: Pick<ExamParticipationRepository, 'findById'>;
  summaryRepository?: Pick<
    ProctoringSummaryRepository,
    'findByParticipation' | 'updateReviewerDecision'
  >;
  eventRepository?: Pick<ProctoringEventRepository, 'findByParticipation'>;
  consentRepository?: Pick<ProctoringConsentRepository, 'findByParticipation'>;
  precheckRepository?: Pick<ProctoringPrecheckRepository, 'findByParticipation'>;
  bypassRepository?: Pick<ProctoringBypassRepository, 'findByParticipation'>;
  finalFlushRepository?: Pick<ProctoringFinalFlushRepository, 'findByParticipation'>;
  dataRequestRepository?: Pick<ProctoringDataRequestRepository, 'findByParticipation'>;
  reviewLabelRepository?: Pick<
    ProctoringReviewLabelRepository,
    'upsertReviewerLabel' | 'findByParticipation'
  >;
  settingsRepository?: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  anomalyResultRepository?: Pick<ProctoringAnomalyResultRepository, 'findLatestByParticipation'>;
  llmSummaryRepository?: Pick<ProctoringLlmSummaryRepository, 'findLatestByParticipation'>;
  evaluationReportRepository?: Pick<ProctoringEvaluationReportRepository, 'findLatestForModel'>;
  summaryService?: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
  aiJobService?: Pick<ProctoringAiJobService, 'enqueueManualRecomputeWindow'>;
  modelRegistryService?: Pick<ProctoringModelRegistryService, 'resolveAnomalyModel'>;
  auditLogRepository?: Pick<ExamAuditLogRepository, 'create'>;
  nowFactory?: () => Date;
};

export type ProctoringAdminReviewActor = {
  userId?: string;
  role?: string;
};

function serializeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : null;
}

const forbiddenPayloadKeys = new Set([
  'rawmedia',
  'media',
  'imagedata',
  'videodata',
  'audiodata',
  'clipboardtext',
  'rawclipboardtext',
  'text',
  'rawtext',
  'content',
  'keystrokes',
  'keystrokecontent',
  'keycontent',
  'sourcecode',
  'code',
  'rawprompt',
  'rawproviderresponse',
]);

function normalizePayloadKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function safePayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => safePayloadValue(item));
  }
  if (value && typeof value === 'object') {
    return safePayload(value);
  }
  return value;
}

function safePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  return Object.entries(payload as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (forbiddenPayloadKeys.has(normalizePayloadKey(key))) {
        return acc;
      }
      acc[key] = safePayloadValue(value);
      return acc;
    },
    {},
  );
}

function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(200, Math.max(1, Math.trunc(parsed)));
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

export class ProctoringAdminReviewService {
  private readonly examRepository: Pick<ExamRepository, 'findById'>;
  private readonly participationRepository: Pick<ExamParticipationRepository, 'findById'>;
  private readonly summaryRepository: Pick<
    ProctoringSummaryRepository,
    'findByParticipation' | 'updateReviewerDecision'
  >;
  private readonly eventRepository: Pick<ProctoringEventRepository, 'findByParticipation'>;
  private readonly consentRepository: Pick<ProctoringConsentRepository, 'findByParticipation'>;
  private readonly precheckRepository: Pick<ProctoringPrecheckRepository, 'findByParticipation'>;
  private readonly bypassRepository: Pick<ProctoringBypassRepository, 'findByParticipation'>;
  private readonly finalFlushRepository: Pick<ProctoringFinalFlushRepository, 'findByParticipation'>;
  private readonly dataRequestRepository: Pick<ProctoringDataRequestRepository, 'findByParticipation'>;
  private readonly reviewLabelRepository: Pick<
    ProctoringReviewLabelRepository,
    'upsertReviewerLabel' | 'findByParticipation'
  >;
  private readonly settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  private readonly anomalyResultRepository: Pick<
    ProctoringAnomalyResultRepository,
    'findLatestByParticipation'
  >;
  private readonly llmSummaryRepository: Pick<
    ProctoringLlmSummaryRepository,
    'findLatestByParticipation'
  >;
  private readonly evaluationReportRepository: Pick<
    ProctoringEvaluationReportRepository,
    'findLatestForModel'
  >;
  private readonly summaryService: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
  private readonly aiJobService: Pick<ProctoringAiJobService, 'enqueueManualRecomputeWindow'>;
  private readonly modelRegistryService: Pick<ProctoringModelRegistryService, 'resolveAnomalyModel'>;
  private readonly auditLogRepository: Pick<ExamAuditLogRepository, 'create'>;
  private readonly nowFactory: () => Date;

  constructor(deps: AdminReviewDependencies = {}) {
    this.examRepository = deps.examRepository ?? createExamRepository();
    this.participationRepository =
      deps.participationRepository ?? new ExamParticipationRepository();
    this.summaryRepository = deps.summaryRepository ?? new ProctoringSummaryRepository();
    this.eventRepository = deps.eventRepository ?? new ProctoringEventRepository();
    this.consentRepository = deps.consentRepository ?? new ProctoringConsentRepository();
    this.precheckRepository = deps.precheckRepository ?? new ProctoringPrecheckRepository();
    this.bypassRepository = deps.bypassRepository ?? new ProctoringBypassRepository();
    this.finalFlushRepository = deps.finalFlushRepository ?? new ProctoringFinalFlushRepository();
    this.dataRequestRepository = deps.dataRequestRepository ?? new ProctoringDataRequestRepository();
    this.reviewLabelRepository = deps.reviewLabelRepository ?? new ProctoringReviewLabelRepository();
    this.settingsRepository = deps.settingsRepository ?? new ProctoringSettingsRepository();
    this.anomalyResultRepository =
      deps.anomalyResultRepository ?? new ProctoringAnomalyResultRepository();
    this.llmSummaryRepository =
      deps.llmSummaryRepository ?? new ProctoringLlmSummaryRepository();
    this.evaluationReportRepository =
      deps.evaluationReportRepository ?? new ProctoringEvaluationReportRepository();
    this.summaryService = deps.summaryService ?? createProctoringSummaryService();
    this.aiJobService = deps.aiJobService ?? createProctoringAiJobService();
    this.modelRegistryService = deps.modelRegistryService ?? createProctoringModelRegistryService();
    this.auditLogRepository = deps.auditLogRepository ?? new ExamAuditLogRepository();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
  }

  private async assertReviewAccess(
    examId: string,
    participationId: string,
    actor: ProctoringAdminReviewActor,
  ): Promise<void> {
    if (!actor.userId || !actor.role) {
      throw new AppException('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const [exam, participation] = await Promise.all([
      this.examRepository.findById(examId),
      this.participationRepository.findById(participationId),
    ]);

    if (!exam) {
      throw new AppException('Exam not found', 404, 'EXAM_NOT_FOUND');
    }
    if (!participation || participation.examId !== examId) {
      throw new AppException(
        'Proctoring review not found',
        404,
        'PROCTORING_REVIEW_NOT_FOUND',
      );
    }

    const role = actor.role.toLowerCase();
    if (role === 'owner' || role === 'admin') {
      return;
    }

    if (role === 'teacher') {
      return;
    }

    throw new AppException(
      'Not authorized to review proctoring evidence for this exam',
      403,
      'PROCTORING_REVIEW_FORBIDDEN',
    );
  }

  async getReview(
    examId: string,
    participationId: string,
    actor: ProctoringAdminReviewActor,
    query: Partial<AdminProctoringReviewQueryInput> = {},
  ) {
    await this.assertReviewAccess(examId, participationId, actor);

    const limit = normalizeLimit(query.limit, 50);
    const offset = normalizeOffset(query.offset);
    const eventName = query.eventName?.trim();
    const userId = actor.userId;
    const [summary, events, consent, precheck, bypass, finalFlush, dataRequests, allReviewLabels, llmSummaryRecord, settings] =
      await Promise.all([
        this.summaryRepository.findByParticipation(participationId),
        this.eventRepository.findByParticipation(participationId, { limit: 1000 }),
        this.consentRepository.findByParticipation(participationId),
        this.precheckRepository.findByParticipation(participationId),
        this.bypassRepository.findByParticipation(participationId),
        this.finalFlushRepository.findByParticipation(participationId),
        this.dataRequestRepository.findByParticipation(participationId),
        this.reviewLabelRepository.findByParticipation(participationId),
        this.llmSummaryRepository.findLatestByParticipation(participationId),
        this.settingsRepository.findByExamId(examId),
      ]);
    const reviewLabel = userId
      ? (allReviewLabels ?? []).filter(l => l.reviewerId === userId)
      : (allReviewLabels ?? []);

    if (summary && summary.examId !== examId) {
      throw new AppException('Proctoring summary not found for exam', 404, 'PROCTORING_SUMMARY_NOT_FOUND');
    }

    const filteredEvents = eventName
      ? events.filter(event => {
          const payload = safePayload(event.payloadJson);
          return payload.eventName === eventName || event.type === eventName;
        })
      : events;
    const items = filteredEvents.slice(offset, offset + limit).map(event => {
      const payloadJson = safePayload(event.payloadJson);
      return {
        id: event.id,
        type: event.type,
        eventName: String(payloadJson.eventName ?? event.type),
        severity: event.severity,
        clientSeq: event.clientSeq,
        capturedAt: serializeDate(event.capturedAt),
        receivedAt: serializeDate(event.receivedAt),
        finalFlushReceiptId: event.finalFlushReceiptId ?? null,
        payloadJson,
      };
    });

    const aiAdvisory = await this.buildAiAdvisory(examId, participationId, settings);

    const llmSummary = this.buildLlmSummary(examId, settings, llmSummaryRecord);

    return {
      summary: summary
        ? {
            id: summary.id,
            examId: summary.examId,
            participationId: summary.participationId,
            riskScore: summary.riskScore,
            riskLevel: summary.riskLevel,
            eventCountsJson: summary.eventCountsJson,
            velocityJson: summary.velocityJson,
            finalFlushStatus: summary.finalFlushStatus,
            deterministicSchemaVersion: summary.deterministicSchemaVersion,
            computedAt: serializeDate(summary.computedAt),
            reviewerDecision: summary.reviewerDecision,
            reviewerId: summary.reviewerId,
            reviewerNotes: summary.reviewerNotes,
            reviewedAt: serializeDate(summary.reviewedAt),
          }
        : null,
      timeline: {
        items,
        total: filteredEvents.length,
        limit,
        offset,
      },
      evidence: {
        consent,
        precheck,
        bypass: (bypass ?? []).map(({ codeHash: _ch, ...rest }) => rest),
        finalFlush,
        dataRequests,
      },
      reviewLabel: reviewLabel?.length
        ? {
            id: reviewLabel[0]!.id,
            reviewOutcome: reviewLabel[0]!.reviewOutcome,
            evidenceConfidence: reviewLabel[0]!.evidenceConfidence,
            notes: reviewLabel[0]!.notes,
            reviewerId: reviewLabel[0]!.reviewerId,
            createdAt: serializeDate(reviewLabel[0]!.createdAt),
          }
        : null,
      aiAdvisory,
      llmSummary,
    };
  }

  private async buildAiAdvisory(
    examId: string,
    participationId: string,
    settings: ExamProctoringSettingsEntity | null,
  ) {
    if (settings?.aiShadowMode !== false) {
      return {
        visible: false,
        status: 'hidden_shadow_mode' as const,
        windows: [],
      };
    }
    if (!settings.aiAdvisoryVisible) {
      return {
        visible: false,
        status: 'hidden_no_gate' as const,
        windows: [],
      };
    }

    const results = await this.anomalyResultRepository.findLatestByParticipation(participationId);
    if (results.length === 0) {
      return {
        visible: false,
        status: 'unavailable' as const,
        windows: [],
      };
    }

    const modelVersion = String(results[0]!.modelVersion);
    const report = await this.evaluationReportRepository.findLatestForModel(modelVersion);
    if (report?.status !== (settings.aiMinimumEvaluationStatus ?? 'passed_gate')) {
      return {
        visible: false,
        status: 'hidden_no_gate' as const,
        windows: [],
      };
    }

    const windows = results.map(result => ({
      windowId: result.windowId,
      windowStart: serializeDate(result.windowStart),
      windowEnd: serializeDate(result.windowEnd),
      anomalyScore: Number(result.anomalyScore),
      riskLevel: result.riskLevel,
      explanationStatus: result.explanationStatus,
      topContributors: this.safeContributors(result.topContributorsJson),
    }));
    const maxResult = [...results].sort(
      (a, b) => Number(b.anomalyScore) - Number(a.anomalyScore)
    )[0]!;

    return {
      visible: true,
      status: 'visible' as const,
      modelVersion,
      featureSchemaVersion: results[0]!.featureSchemaVersion,
      scoringSchemaVersion: results[0]!.scoringSchemaVersion,
      latestRiskLevel: maxResult.riskLevel,
      maxAnomalyScore: Number(maxResult.anomalyScore),
      windows,
    };
  }

  private buildLlmSummary(
    examId: string,
    settings: any,
    llmSummaryRecord: any
  ): Record<string, unknown> | null {
    if (!settings || !settings.llmSummaryEnabled) {
      return {
        visible: false,
        status: 'hidden_disabled',
        riskFacts: [] as string[],
        citations: [] as string[],
        missingDataNotes: [] as string[],
        modelNotes: [] as string[],
      };
    }

    if (!llmSummaryRecord || llmSummaryRecord.status !== 'accepted') {
      return {
        visible: false,
        status: 'unavailable',
        riskFacts: [] as string[],
        citations: [] as string[],
        missingDataNotes: [] as string[],
        modelNotes: [] as string[],
      };
    }

    return {
      visible: true,
      status: 'accepted' as const,
      summaryId: llmSummaryRecord.id,
      provider: llmSummaryRecord.provider,
      modelVersion: llmSummaryRecord.modelVersion,
      promptVersion: llmSummaryRecord.promptVersion,
      validationStatus: llmSummaryRecord.validationStatus,
      validationScore: Number(llmSummaryRecord.validationScore ?? 0),
      summaryText: llmSummaryRecord.summaryJson?.summaryText ?? '',
      riskFacts: llmSummaryRecord.riskFactsJson ?? [],
      citations: llmSummaryRecord.sourceEventIdsJson?.map((sid: string) => ({
        eventId: sid,
        reason: 'summary evidence',
      })) ?? [],
      missingDataNotes: llmSummaryRecord.missingDataNotesJson ?? [],
      modelNotes: llmSummaryRecord.modelNotesJson ?? [],
      completedAt: serializeDate(llmSummaryRecord.completedAt),
    };
  }

  private safeContributors(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }
      const record = item as Record<string, unknown>;
      if (
        typeof record.featureName !== 'string' ||
        typeof record.numericValue !== 'number' ||
        typeof record.contribution !== 'number' ||
        (record.direction !== 'increased_risk' && record.direction !== 'decreased_risk') ||
        typeof record.displayLabel !== 'string'
      ) {
        return [];
      }
      return [
        {
          featureName: record.featureName,
          numericValue: record.numericValue,
          contribution: record.contribution,
          direction: record.direction,
          displayLabel: record.displayLabel,
        },
      ];
    });
  }

  async recompute(
    examId: string,
    participationId: string,
    actor: ProctoringAdminReviewActor,
    input: Partial<RecomputeProctoringReviewInput> = {},
  ) {
    await this.assertReviewAccess(examId, participationId, actor);
    const recomputeDeterministic = input.recomputeDeterministic !== false;
    const recomputeAi = input.recomputeAi === true;
    let summary = null;
    let aiJob = null;
    let resolvedModelVersion: string | null = null;

    if (recomputeDeterministic) {
      summary = await this.summaryService.recomputeForParticipation({
        participationId,
        reviewPolicy: { needsReReview: Boolean(input.needsReReview) },
      });
    }

    if (recomputeAi) {
      const model = await this.modelRegistryService.resolveAnomalyModel(input.modelVersion ?? null);
      resolvedModelVersion = model.modelVersion;
      const events = await this.eventRepository.findByParticipation(participationId, { limit: 1000 });
      aiJob = await this.aiJobService.enqueueManualRecomputeWindow({
        events,
        modelVersion: model.modelVersion,
        reason: input.reason,
        now: this.nowFactory(),
      });
    }

    await this.auditLogRepository.create({
      examId,
      actorType: actor.userId ? 'user' : 'system',
      actorId: actor.userId,
      action: 'proctoring_review_recompute',
      targetType: 'exam_participation',
      targetId: participationId,
      metadata: {
        needsReReview: Boolean(input.needsReReview),
        recomputeDeterministic,
        recomputeAi,
        modelVersion: resolvedModelVersion,
        reasonPresent: Boolean(input.reason?.trim()),
        aiJobId: aiJob?.id ?? null,
      },
    });

    return recomputeDeterministic
      ? summary
      : {
          id: null,
          participationId,
          aiJobId: aiJob?.id ?? null,
        };
  }

  async recordReviewDecision(
    examId: string,
    participationId: string,
    actor: ProctoringAdminReviewActor,
    input: ReviewProctoringDecisionInput,
  ) {
    await this.assertReviewAccess(examId, participationId, actor);

    const reviewedAt = this.nowFactory();
    const updated = await this.summaryRepository.updateReviewerDecision({
      participationId,
      reviewerDecision: input.decision,
      reviewerId: actor.userId,
      reviewerNotes: input.notes ?? null,
      reviewedAt,
    });

    if (!updated) {
      throw new AppException('Proctoring summary not found', 404, 'PROCTORING_SUMMARY_NOT_FOUND');
    }

    await this.auditLogRepository.create({
      examId,
      actorType: actor.userId ? 'user' : 'system',
      actorId: actor.userId,
      action: 'proctoring_review_decision',
      targetType: 'exam_participation',
      targetId: participationId,
      metadata: {
        decision: input.decision,
        notesPresent: Boolean(input.notes?.trim()),
      },
    });

    return updated;
  }

  async recordReviewLabel(
    examId: string,
    participationId: string,
    actor: ProctoringAdminReviewActor,
    input: RecordProctoringReviewLabelInput,
  ) {
    await this.assertReviewAccess(examId, participationId, actor);
    if (!actor.userId) {
      throw new AppException('Reviewer identity is required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const summary = await this.summaryRepository.findByParticipation(participationId);
    const label = await this.reviewLabelRepository.upsertReviewerLabel({
      examId,
      participationId,
      summaryId: summary?.id ?? null,
      reviewerId: actor.userId,
      reviewOutcome: input.reviewOutcome,
      evidenceConfidence: input.evidenceConfidence,
      notes: input.notes ?? null,
      labelSchemaVersion: 'review-label-v1',
    });

    await this.auditLogRepository.create({
      examId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'proctoring_review_label',
      targetType: 'exam_participation',
      targetId: participationId,
      metadata: {
        reviewOutcome: input.reviewOutcome,
        evidenceConfidence: input.evidenceConfidence,
        notesPresent: Boolean(input.notes?.trim()),
        labelSchemaVersion: 'review-label-v1',
      },
    });

    return label;
  }
}

export function createProctoringAdminReviewService(): ProctoringAdminReviewService {
  return new ProctoringAdminReviewService();
}
