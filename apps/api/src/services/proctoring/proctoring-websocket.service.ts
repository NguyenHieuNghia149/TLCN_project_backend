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
import {
  createProctoringSocketTokenService,
  ProctoringSocketTokenService,
} from './proctoring-socket-token.service';

type ProctoringSocketAdapter = {
  id: string;
  handshake?: {
    auth?: Record<string, unknown>;
  };
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
  socketTokenService?: Pick<ProctoringSocketTokenService, 'verifyTokenForHello'>;
  nowFactory?: () => Date;
};

type SessionContext = {
  participationId: string;
  clientSessionId: string;
  userId: string;
  examId: string;
  sessionId: string;
  entrySessionId: string | null;
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
  private readonly socketTokenService: Pick<ProctoringSocketTokenService, 'verifyTokenForHello'>;
  private readonly nowFactory: () => Date;
  private readonly seenSequences = new Map<string, Set<number>>();
  private readonly socketContexts = new Map<string, SessionContext>();

  constructor(deps: ProctoringWebSocketServiceDependencies) {
    this.namespace = deps.namespace;
    this.redisService = deps.redisService ?? createProctoringRedisService();
    this.validator = deps.validator ?? new ProctoringEventValidatorService();
    this.rateLimitService = deps.rateLimitService ?? createProctoringRateLimitService();
    this.socketTokenService = deps.socketTokenService ?? createProctoringSocketTokenService();
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
          const token = this.extractSocketToken(socket, payload);
          const claims = await this.socketTokenService.verifyTokenForHello({
            token,
            participationId: hello.participationId,
            clientSessionId: hello.clientSessionId,
            userId: hello.userId,
          });
          if (!claims.proctoringSessionId) {
            throw new ProctoringValidationError(
              'proctoring session is required for websocket telemetry',
              'MISSING_PROCTORING_SESSION',
            );
          }
          const context = {
            ...hello,
            userId: claims.sub,
            examId: claims.examId,
            sessionId: claims.proctoringSessionId,
            entrySessionId: claims.entrySessionId ?? null,
          };
          this.socketContexts.set(socket.id, context);
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
          this.rejectSessionHello(socket, error as Error);
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

  private extractSocketToken(socket: ProctoringSocketAdapter, payload: unknown): string {
    const authToken = socket.handshake?.auth?.proctoringToken;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    if (payload && typeof payload === 'object') {
      const fallback = (payload as Record<string, unknown>).proctoringToken;
      if (typeof fallback === 'string' && fallback.length > 0) {
        return fallback;
      }
    }
    throw new ProctoringValidationError('proctoring socket token is required', 'MISSING_PROCTORING_SOCKET_TOKEN');
  }

  private rejectSessionHello(socket: ProctoringSocketAdapter, error: Error): void {
    socket.emit('session.rejected', {
      reason: 'invalid_proctoring_socket_token',
      message: error.message,
    });
    socket.disconnect?.();
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
    const nonce =
      payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).nonce === 'string'
        ? (payload as Record<string, unknown>).nonce as string
        : undefined;

    try {
      const context = this.socketContexts.get(socket.id);
      if (!context) {
        throw new ProctoringValidationError('session.hello is required before telemetry', 'SESSION_NOT_READY');
      }

      const frames =
        type === 'telemetry.batch'
          ? this.normalizeBatchPayload(payload)
          : [this.normalizeSingleFramePayload(payload, type)];

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

      const maxClientSeq = frames.reduce((max, f) => Math.max(max, f.clientSeq), 0);

      if (!decision.allowed) {
        socket.emit('telemetry.retry_required', {
          reason: decision.reason ?? 'batch_rejected',
          lastClientSeq: maxClientSeq,
          nonce,
        });
        return;
      }

      const redisIds: string[] = [];
      let dedupedCount = 0;

      for (const frame of frames) {
        if (frame.participationId !== context.participationId || frame.clientSessionId !== context.clientSessionId) {
          throw new ProctoringValidationError(
            `frame participationId/clientSessionId does not match authenticated socket context`,
            'FORBIDDEN_TELEMETRY_PAYLOAD',
          );
        }

        if (this.rateLimitService.isStaleBufferedEvent(frame, this.nowFactory())) {
          socket.emit('telemetry.retry_required', {
            reason: 'stale_buffered_event',
            lastClientSeq: frame.clientSeq,
            nonce,
          });
          return;
        }

        if (this.isDuplicate(frame.participationId, frame.clientSessionId, frame.clientSeq)) {
          dedupedCount += 1;
          continue;
        }

        const enriched = {
          ...frame,
          examId: context.examId,
          sessionId: context.sessionId,
          candidateUserId: context.userId,
          entrySessionId: context.entrySessionId,
        };

        const result = await this.redisService.appendTelemetryEvent({
          shard: 0,
          event: {
            ...enriched,
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
        lastClientSeq: maxClientSeq,
        nonce,
      });
    } catch (error) {
      this.handleTelemetryFailure(socket, error as Error, nonce);
    }
  }

  private handleTelemetryFailure(socket: ProctoringSocketAdapter, error: Error, nonce?: string): void {
    if (error instanceof ProctoringValidationError && error.code === 'FORBIDDEN_TELEMETRY_PAYLOAD') {
      socket.emit('session.suspended', {
        reason: error.message,
      });
      return;
    }

    socket.emit('telemetry.retry_required', {
      reason: error.message,
      nonce,
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
    type: 'telemetry.urgent',
  ): ProctoringTelemetryFrameInput {
    if (!payload || typeof payload !== 'object') {
      throw new ProctoringValidationError(`${type} payload must be an object`, 'INVALID_PROCTORING_FRAME');
    }

    if ((payload as Record<string, unknown>).event) {
      return this.validator.validateTelemetryFrame((payload as Record<string, unknown>).event);
    }

    return this.validator.validateTelemetryFrame({
      ...(payload as Record<string, unknown>),
      type,
    });
  }

  private normalizeSingleFramePayload(
    payload: unknown,
    type: 'telemetry.urgent' | 'final_flush.request',
  ): ProctoringTelemetryFrameInput {
    if (type === 'telemetry.urgent') {
      return this.extractSingleFramePayload(payload, type);
    }

    this.validator.validateFinalFlushRequest(payload);
    return this.validator.validateTelemetryFrame(
      telemetryEnvelopeFromPayload(type, payload as Record<string, unknown>),
    );
  }
}

export function createProctoringWebSocketService(
  namespace: ProctoringNamespaceAdapter,
): ProctoringWebSocketService {
  return new ProctoringWebSocketService({ namespace });
}
