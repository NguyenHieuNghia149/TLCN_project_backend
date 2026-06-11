import {
  createProctoringRedisService,
  ProctoringRedisService,
} from './proctoring-redis.service';
import {
  ProctoringEventValidatorService,
  ProctoringValidationError,
  ProctoringTelemetryFrameInput,
} from './proctoring-event-validator.service';
import {
  createProctoringRateLimitService,
  ProctoringRateLimitService,
} from './proctoring-rate-limit.service';

type ProctoringSocketAdapter = {
  id: string;
  on(event: string, listener: (payload: unknown) => void): ProctoringSocketAdapter;
  emit(event: string, data: unknown): boolean;
  join(room: string): void;
  disconnect?: () => void;
};

type ProctoringNamespaceAdapter = {
  on(event: 'connection', listener: (socket: ProctoringSocketAdapter) => void): ProctoringNamespaceAdapter;
  emit(event: string, data: unknown): boolean;
  to(room: string): { emit(event: string, data: unknown): boolean };
};

export type ProctoringWebSocketServiceDependencies = {
  namespace: ProctoringNamespaceAdapter;
  redisService?: Pick<ProctoringRedisService, 'upsertSessionState' | 'appendTelemetryEvent'>;
  validator?: ProctoringEventValidatorService;
  rateLimitService?: ProctoringRateLimitService;
  nowFactory?: () => Date;
};

type SessionContext = {
  participationId: string;
  clientSessionId: string;
  userId: string;
  lastSeenClientSeq: number;
};

function roomName(participationId: string): string {
  return `proctoring:participation:${participationId}`;
}

function telemetryEnvelopeFromPayload(
  type: 'telemetry.batch' | 'telemetry.urgent' | 'final_flush.request',
  frame: ProctoringTelemetryFrameInput | Record<string, unknown>,
): ProctoringTelemetryFrameInput {
  if (type === 'final_flush.request') {
    const payload = frame as Record<string, unknown>;
    return {
      type,
      participationId: String(payload.participationId ?? ''),
      clientSessionId: String(payload.clientSessionId ?? ''),
      clientSeq: Number(payload.clientSeq ?? 0),
      capturedAt: String(payload.capturedAt ?? new Date().toISOString()),
      receivedAt: String(payload.receivedAt ?? new Date().toISOString()),
      schemaVersion: Number(payload.schemaVersion ?? 1),
      severity: String(payload.severity ?? 'info'),
      payloadJson: {
        submitAttemptId: payload.submitAttemptId,
        expectedEventCount: payload.expectedEventCount,
        acceptedCount: payload.acceptedCount,
        firstClientSeq: payload.firstClientSeq,
        lastClientSeq: payload.lastClientSeq,
      },
      finalFlushReceiptId: typeof payload.finalFlushReceiptId === 'string' ? payload.finalFlushReceiptId : null,
      entrySessionId: null,
      id: typeof payload.id === 'string' ? payload.id : null,
    };
  }

  return frame as ProctoringTelemetryFrameInput;
}

export class ProctoringWebSocketService {
  private readonly namespace: ProctoringNamespaceAdapter;
  private readonly redisService: Pick<
    ProctoringRedisService,
    'upsertSessionState' | 'appendTelemetryEvent'
  >;
  private readonly validator: ProctoringEventValidatorService;
  private readonly rateLimitService: ProctoringRateLimitService;
  private readonly nowFactory: () => Date;
  private readonly seenSequences = new Map<string, Set<number>>();
  private readonly socketContexts = new Map<string, SessionContext>();

  constructor(deps: ProctoringWebSocketServiceDependencies) {
    this.namespace = deps.namespace;
    this.redisService = deps.redisService ?? createProctoringRedisService();
    this.validator = deps.validator ?? new ProctoringEventValidatorService();
    this.rateLimitService = deps.rateLimitService ?? createProctoringRateLimitService();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
    this.setupNamespace();
  }

  suspendParticipation(participationId: string, reason: string): void {
    this.namespace.to(roomName(participationId)).emit('session.suspended', {
      participationId,
      reason,
    });
  }

  requestResume(participationId: string, reason: string): void {
    this.namespace.to(roomName(participationId)).emit('session.resume_required', {
      participationId,
      reason,
    });
  }

  private setupNamespace(): void {
    this.namespace.on('connection', socket => {
      socket.on('session.hello', async payload => {
        try {
          const hello = this.validator.validateSessionHello(payload);
          this.socketContexts.set(socket.id, hello);
          this.seenSequences.set(this.dedupeKey(hello.participationId, hello.clientSessionId), new Set());
          socket.join(roomName(hello.participationId));
          await this.redisService.upsertSessionState({
            participationId: hello.participationId,
            sessionId: socket.id,
            clientSessionId: hello.clientSessionId,
            status: 'active',
            lastSeenAt: this.nowFactory(),
            lastAcceptedClientSeq: hello.lastSeenClientSeq,
          });
          socket.emit('session.ready', {
            participationId: hello.participationId,
            clientSessionId: hello.clientSessionId,
            lastSeenClientSeq: hello.lastSeenClientSeq,
            serverTime: this.nowFactory().toISOString(),
          });
        } catch (error) {
          this.handleValidationFailure(socket, error as Error);
        }
      });

      socket.on('telemetry.batch', async payload => {
        await this.handleTelemetryEnvelope(socket, 'telemetry.batch', payload);
      });

      socket.on('telemetry.urgent', async payload => {
        await this.handleTelemetryEnvelope(socket, 'telemetry.urgent', payload);
      });

      socket.on('final_flush.request', async payload => {
        await this.handleTelemetryEnvelope(socket, 'final_flush.request', payload);
      });
    });
  }

  private handleValidationFailure(socket: ProctoringSocketAdapter, error: Error): void {
    if (error instanceof ProctoringValidationError && error.code === 'FORBIDDEN_TELEMETRY_PAYLOAD') {
      socket.emit('session.suspended', {
        reason: error.message,
      });
      return;
    }

    socket.emit('telemetry.retry_required', {
      reason: error.message,
    });
  }

  private dedupeKey(participationId: string, clientSessionId: string): string {
    return `${participationId}:${clientSessionId}`;
  }

  private isDuplicate(participationId: string, clientSessionId: string, clientSeq: number): boolean {
    const key = this.dedupeKey(participationId, clientSessionId);
    const seen = this.seenSequences.get(key);
    if (!seen) {
      return false;
    }
    if (seen.has(clientSeq)) {
      return true;
    }
    seen.add(clientSeq);
    return false;
  }

  private async handleTelemetryEnvelope(
    socket: ProctoringSocketAdapter,
    type: 'telemetry.batch' | 'telemetry.urgent' | 'final_flush.request',
    payload: unknown,
  ): Promise<void> {
    try {
      const context = this.socketContexts.get(socket.id);
      if (!context) {
        throw new ProctoringValidationError('session.hello is required before telemetry', 'SESSION_NOT_READY');
      }

      const frames =
        type === 'telemetry.batch'
          ? this.normalizeBatchPayload(payload)
          : [telemetryEnvelopeFromPayload(type, this.extractSingleFramePayload(payload, type))];

      const decision = this.rateLimitService.allowBatch({
        participationId: context.participationId,
        clientSessionId: context.clientSessionId,
        events: frames.map(frame => ({
          clientSeq: frame.clientSeq,
          receivedAt: frame.receivedAt,
          capturedAt: frame.capturedAt,
        })),
        now: this.nowFactory(),
      });

      if (!decision.allowed) {
        socket.emit('telemetry.retry_required', {
          reason: decision.reason ?? 'batch_rejected',
        });
        return;
      }

      const redisIds: string[] = [];
      let dedupedCount = 0;

      for (const frame of frames) {
        if (this.rateLimitService.isStaleBufferedEvent(frame, this.nowFactory())) {
          socket.emit('telemetry.retry_required', {
            reason: 'stale_buffered_event',
          });
          return;
        }

        if (this.isDuplicate(frame.participationId, frame.clientSessionId, frame.clientSeq)) {
          dedupedCount += 1;
          continue;
        }

        const result = await this.redisService.appendTelemetryEvent({
          shard: 0,
          event: {
            ...frame,
            buffered: true,
          },
        });
        redisIds.push(result.redisId);
      }

      socket.emit('telemetry.ack', {
        participationId: context.participationId,
        clientSessionId: context.clientSessionId,
        acceptedCount: redisIds.length,
        dedupedCount,
        redisIds,
      });
    } catch (error) {
      this.handleTelemetryFailure(socket, error as Error);
    }
  }

  private handleTelemetryFailure(socket: ProctoringSocketAdapter, error: Error): void {
    if (error instanceof ProctoringValidationError && error.code === 'FORBIDDEN_TELEMETRY_PAYLOAD') {
      socket.emit('session.suspended', {
        reason: error.message,
      });
      return;
    }

    socket.emit('telemetry.retry_required', {
      reason: error.message,
    });
  }

  private normalizeBatchPayload(payload: unknown): ProctoringTelemetryFrameInput[] {
    if (!payload || typeof payload !== 'object') {
      throw new ProctoringValidationError('telemetry.batch payload must be an object', 'INVALID_PROCTORING_FRAME');
    }

    const frames = Array.isArray((payload as Record<string, unknown>).events)
      ? ((payload as Record<string, unknown>).events as unknown[])
      : [];

    return frames.map(frame => this.validator.validateTelemetryFrame(frame));
  }

  private extractSingleFramePayload(
    payload: unknown,
    type: 'telemetry.urgent' | 'final_flush.request',
  ): ProctoringTelemetryFrameInput {
    if (!payload || typeof payload !== 'object') {
      throw new ProctoringValidationError(`${type} payload must be an object`, 'INVALID_PROCTORING_FRAME');
    }

    if (type === 'telemetry.urgent' && (payload as Record<string, unknown>).event) {
      return this.validator.validateTelemetryFrame((payload as Record<string, unknown>).event);
    }

    return this.validator.validateTelemetryFrame({
      ...(payload as Record<string, unknown>),
      type,
    });
  }
}

export function createProctoringWebSocketService(
  namespace: ProctoringNamespaceAdapter,
): ProctoringWebSocketService {
  return new ProctoringWebSocketService({ namespace });
}
