import { AppException } from '@backend/api/exceptions/base.exception';
import { ExamParticipationRepository } from '@backend/api/repositories/examParticipation.repository';
import { ProctoringFinalFlushRepository } from '@backend/api/repositories/proctoring/proctoringFinalFlush.repository';
import { ProctoringSessionRepository } from '@backend/api/repositories/proctoring/proctoringSession.repository';
import { CreateProctoringFinalFlushInput } from '@backend/shared/validations/proctoring.validation';

import {
  createProctoringRedisService,
  ProctoringRedisService,
  sanitizeTelemetryPayload,
} from './proctoring-redis.service';

type ProctoringFinalFlushDependencies = {
  participationRepository?: Pick<ExamParticipationRepository, 'findById'>;
  sessionRepository?: Pick<
    ProctoringSessionRepository,
    'findActiveByParticipationAndClientSession'
  >;
  finalFlushRepository?: Pick<ProctoringFinalFlushRepository, 'upsertReceipt'>;
  redisService?: Pick<ProctoringRedisService, 'appendTelemetryEvent'>;
  nowFactory?: () => Date;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventDate(value: unknown, fallback: Date): string {
  if (typeof value !== 'string') {
    return fallback.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

export class ProctoringFinalFlushService {
  private readonly participationRepository: Pick<ExamParticipationRepository, 'findById'>;
  private readonly sessionRepository: Pick<
    ProctoringSessionRepository,
    'findActiveByParticipationAndClientSession'
  >;
  private readonly finalFlushRepository: Pick<ProctoringFinalFlushRepository, 'upsertReceipt'>;
  private readonly redisService: Pick<ProctoringRedisService, 'appendTelemetryEvent'>;
  private readonly nowFactory: () => Date;

  constructor(deps: ProctoringFinalFlushDependencies = {}) {
    this.participationRepository = deps.participationRepository ?? new ExamParticipationRepository();
    this.sessionRepository = deps.sessionRepository ?? new ProctoringSessionRepository();
    this.finalFlushRepository = deps.finalFlushRepository ?? new ProctoringFinalFlushRepository();
    this.redisService = deps.redisService ?? createProctoringRedisService();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
  }

  async submitFinalFlush(
    participationId: string,
    userId: string | undefined,
    input: CreateProctoringFinalFlushInput,
  ): Promise<{ receiptId: string; status: string }> {
    const participation = await this.participationRepository.findById(participationId);
    if (!participation) {
      throw new AppException('Participation not found', 404, 'EXAM_PARTICIPATION_NOT_FOUND');
    }

    if (userId && participation.userId !== userId) {
      throw new AppException('Participation does not belong to user', 403, 'EXAM_PARTICIPATION_FORBIDDEN');
    }

    const clientSessionId = input.clientSessionId;
    const session = await this.sessionRepository.findActiveByParticipationAndClientSession({
      participationId,
      clientSessionId,
    });
    if (!session) {
      throw new AppException('Active proctoring session not found', 409, 'PROCTORING_SESSION_NOT_FOUND');
    }

    const now = this.nowFactory();
    const expectedEventCount = input.expectedEventCount ?? input.events.length;
    const receipt = await this.finalFlushRepository.upsertReceipt({
      id: input.finalFlushReceiptId,
      examId: participation.examId,
      participationId,
      sessionId: session.id,
      clientSessionId,
      submitAttemptId: input.submitAttemptId,
      status: input.events.length > 0 ? 'received' : 'persisted',
      expectedEventCount,
      acceptedCount: 0,
      firstClientSeq:
        input.firstClientSeq ??
        (input.events.length > 0 ? input.events[0]?.clientSeq ?? null : null),
      lastClientSeq:
        input.lastClientSeq ??
        (input.events.length > 0
          ? input.events[input.events.length - 1]?.clientSeq ?? null
          : null),
      persistedAt: input.events.length > 0 ? null : now,
    });

    for (const event of input.events) {
      await this.redisService.appendTelemetryEvent({
        shard: 0,
        event: {
          id: optionalString(event.id),
          examId: participation.examId,
          participationId,
          sessionId: session.id,
          entrySessionId: session.entrySessionId ?? null,
          candidateUserId: session.candidateUserId ?? participation.userId,
          clientSessionId,
          clientSeq: event.clientSeq,
          type: event.type,
          severity: event.severity,
          schemaVersion: event.schemaVersion,
          payloadJson: sanitizeTelemetryPayload(event.payloadJson),
          capturedAt: eventDate(event.capturedAt, now),
          receivedAt: eventDate(event.receivedAt, now),
          buffered: true,
          finalFlushReceiptId: receipt.id,
        },
      });
    }

    return {
      receiptId: receipt.id,
      status: receipt.status,
    };
  }
}

export function createProctoringFinalFlushService(): ProctoringFinalFlushService {
  return new ProctoringFinalFlushService();
}
