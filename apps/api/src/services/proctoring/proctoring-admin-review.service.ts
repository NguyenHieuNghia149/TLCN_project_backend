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
import { ProctoringSummaryRepository } from '@backend/api/repositories/proctoring/proctoringSummary.repository';
import {
  AdminProctoringReviewQueryInput,
  RecomputeProctoringReviewInput,
  ReviewProctoringDecisionInput,
} from '@backend/shared/validations/proctoring.validation';

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
  summaryService?: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
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

function safePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const forbiddenKeys = new Set([
    'rawmedia',
    'media',
    'imagedata',
    'videodata',
    'audiodata',
    'clipboardtext',
    'rawclipboardtext',
    'keystrokes',
    'keystrokecontent',
    'keycontent',
    'sourcecode',
    'code',
  ]);

  return Object.entries(payload as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (forbiddenKeys.has(key.toLowerCase())) {
        return acc;
      }
      acc[key] =
        value && typeof value === 'object' && !Array.isArray(value)
          ? safePayload(value)
          : value;
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
  private readonly summaryService: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
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
    this.summaryService = deps.summaryService ?? createProctoringSummaryService();
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
    if (role === 'teacher' && exam.createdBy === actor.userId) {
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
    const [summary, events, consent, precheck, bypass, finalFlush, dataRequests] =
      await Promise.all([
        this.summaryRepository.findByParticipation(participationId),
        this.eventRepository.findByParticipation(participationId, { limit: 1000 }),
        this.consentRepository.findByParticipation(participationId),
        this.precheckRepository.findByParticipation(participationId),
        this.bypassRepository.findByParticipation(participationId),
        this.finalFlushRepository.findByParticipation(participationId),
        this.dataRequestRepository.findByParticipation(participationId),
      ]);

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
    };
  }

  async recompute(
    examId: string,
    participationId: string,
    actor: ProctoringAdminReviewActor,
    input: Partial<RecomputeProctoringReviewInput> = {},
  ) {
    await this.assertReviewAccess(examId, participationId, actor);
    return this.summaryService.recomputeForParticipation({
      participationId,
      reviewPolicy: { needsReReview: Boolean(input.needsReReview) },
    });
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
}

export function createProctoringAdminReviewService(): ProctoringAdminReviewService {
  return new ProctoringAdminReviewService();
}
