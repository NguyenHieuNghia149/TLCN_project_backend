function createNamespaceMock() {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const namespace: any = {
    on: jest.fn((event: string, listener: (...args: any[]) => void) => {
      handlers[event] = listener;
      return namespace;
    }),
    emit: jest.fn().mockReturnValue(true),
    to: jest.fn(() => ({ emit: jest.fn().mockReturnValue(true) })),
    handlers,
  };
  return namespace;
}

function createSocketMock(id = 'socket-1', auth: Record<string, unknown> = { proctoringToken: 'socket-token' }) {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    id,
    handshake: { auth },
    on: jest.fn((event: string, listener: (...args: any[]) => void) => {
      handlers[event] = listener;
      return socket;
    }),
    emit: jest.fn().mockReturnValue(true),
    join: jest.fn(),
    disconnect: jest.fn(),
    handlers,
  } as any;
  return socket;
}

describe('ProctoringWebSocketService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('registers proctoring namespace handlers and emits session.ready on hello', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn(),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        userId: 'candidate-1',
        lastSeenClientSeq: 12,
      }),
      validateTelemetryFrame: jest.fn(),
      validateFinalFlushRequest: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-1',
        userId: 'candidate-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        proctoringSessionId: 'proctoring-session-1',
        entrySessionId: 'entry-session-1',
      }),
    };

    const service = new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
      socketTokenService,
    });
    const socket = createSocketMock();
    namespace.handlers.connection(socket);

    await socket.handlers['session.hello']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 12,
    });

    expect(namespace.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(socketTokenService.verifyTokenForHello).toHaveBeenCalledWith({
      token: 'socket-token',
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
    });
    expect(redisService.upsertSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        status: 'active',
      }),
    );
    expect(socket.join).toHaveBeenCalledWith('proctoring:participation:participation-1');
    expect(socket.emit).toHaveBeenCalledWith(
      'session.ready',
      expect.objectContaining({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
      }),
    );

    expect(service).toBeDefined();
  });

  it('appends accepted telemetry to Redis and emits telemetry.ack', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '1-0',
      }),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        userId: 'candidate-1',
        lastSeenClientSeq: 12,
      }),
      validateTelemetryFrame: jest.fn().mockImplementation(frame => ({
        ...frame,
        payloadJson: { eventName: 'clipboard_event', action: 'paste' },
      })),
      validateFinalFlushRequest: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-1',
        userId: 'candidate-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        proctoringSessionId: 'proctoring-session-1',
        entrySessionId: 'entry-session-1',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock();
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 12,
    });

    await socket.handlers['telemetry.batch']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      events: [
        {
          type: 'telemetry.batch',
          participationId: 'participation-1',
          clientSessionId: 'client-1',
          clientSeq: 7,
          capturedAt: '2026-06-11T10:00:00.000Z',
          receivedAt: '2026-06-11T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: {
            eventName: 'clipboard_event',
            action: 'paste',
            rawClipboardText: 'secret text',
          },
          entrySessionId: 'client-forged-entry-session',
        },
      ],
    });

    expect(redisService.appendTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shard: 0,
        event: expect.objectContaining({
          participationId: 'participation-1',
          clientSeq: 7,
          examId: 'exam-1',
          sessionId: 'proctoring-session-1',
          entrySessionId: 'entry-session-1',
          candidateUserId: 'candidate-1',
          payloadJson: { eventName: 'clipboard_event', action: 'paste' },
        }),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.ack',
      expect.objectContaining({
        acceptedCount: 1,
        redisIds: ['1-0'],
      }),
    );
  });

  it('emits telemetry.retry_required when Redis append fails', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockRejectedValue(new Error('redis down')),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        userId: 'candidate-1',
        lastSeenClientSeq: 12,
      }),
      validateTelemetryFrame: jest.fn().mockImplementation(frame => frame),
      validateFinalFlushRequest: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-1',
        userId: 'candidate-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        proctoringSessionId: 'proctoring-session-1',
        entrySessionId: 'entry-session-1',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock();
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 12,
    });

    await socket.handlers['telemetry.urgent']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      event: {
        type: 'telemetry.urgent',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        clientSeq: 8,
        capturedAt: '2026-06-11T10:00:00.000Z',
        receivedAt: '2026-06-11T10:00:01.000Z',
        schemaVersion: 1,
        severity: 'info',
        payloadJson: {},
      },
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.retry_required',
      expect.objectContaining({
        reason: 'redis down',
      }),
    );
  });

  it('accepts final_flush.request without requiring telemetry receivedAt from the client', async () => {
    const {
      ProctoringWebSocketService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const {
      ProctoringEventValidatorService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-event-validator.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '2-0',
      }),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-1',
        userId: 'candidate-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        proctoringSessionId: 'proctoring-session-1',
        entrySessionId: 'entry-session-1',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator: new ProctoringEventValidatorService(),
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock();
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 12,
    });

    await socket.handlers['final_flush.request']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      submitAttemptId: 'attempt-1',
      expectedEventCount: 0,
      acceptedCount: 0,
      firstClientSeq: null,
      lastClientSeq: null,
      capturedAt: '2026-06-11T10:00:00.000Z',
      clientSeq: 13,
    });

    expect(redisService.appendTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shard: 0,
        event: expect.objectContaining({
          type: 'final_flush.request',
          participationId: 'participation-1',
          clientSessionId: 'client-1',
          clientSeq: 13,
          examId: 'exam-1',
          sessionId: 'proctoring-session-1',
          entrySessionId: 'entry-session-1',
          candidateUserId: 'candidate-1',
          receivedAt: expect.any(String),
          payloadJson: expect.objectContaining({
            submitAttemptId: 'attempt-1',
            expectedEventCount: 0,
          }),
        }),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.ack',
      expect.objectContaining({
        acceptedCount: 1,
        redisIds: ['2-0'],
      }),
    );
    expect(socket.emit).not.toHaveBeenCalledWith(
      'telemetry.retry_required',
      expect.objectContaining({ reason: 'receivedAt is required' }),
    );
  });

  it('enriches telemetry.batch frames with server-owned examId/sessionId/candidateUserId when client omits them', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '3-0',
      }),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-2',
        clientSessionId: 'client-2',
        userId: 'candidate-2',
        lastSeenClientSeq: 0,
      }),
      validateTelemetryFrame: jest.fn().mockImplementation(frame => ({
        ...frame,
        payloadJson: { eventName: 'focus_lost' },
      })),
      validateFinalFlushRequest: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-2',
        userId: 'candidate-2',
        examId: 'exam-2',
        participationId: 'participation-2',
        clientSessionId: 'client-2',
        proctoringSessionId: 'proctoring-session-2',
        entrySessionId: 'entry-session-2',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock('socket-2');
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-2',
      clientSessionId: 'client-2',
      userId: 'candidate-2',
      lastSeenClientSeq: 0,
    });

    await socket.handlers['telemetry.batch']?.({
      participationId: 'participation-2',
      clientSessionId: 'client-2',
      events: [
        {
          type: 'telemetry.batch',
          participationId: 'participation-2',
          clientSessionId: 'client-2',
          clientSeq: 1,
          capturedAt: '2026-06-11T10:00:00.000Z',
          receivedAt: '2026-06-11T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { eventName: 'focus_lost' },
        },
      ],
    });

    expect(redisService.appendTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shard: 0,
        event: expect.objectContaining({
          examId: 'exam-2',
          sessionId: 'proctoring-session-2',
          entrySessionId: 'entry-session-2',
          candidateUserId: 'candidate-2',
          payloadJson: { eventName: 'focus_lost' },
        }),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.ack',
      expect.objectContaining({ acceptedCount: 1 }),
    );
  });

  it('enriches final_flush.request with server-owned fields and server-side receivedAt when client omits them', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const { ProctoringEventValidatorService } = require('../../../apps/api/src/services/proctoring/proctoring-event-validator.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '4-0',
      }),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-3',
        userId: 'candidate-3',
        examId: 'exam-3',
        participationId: 'participation-3',
        clientSessionId: 'client-3',
        proctoringSessionId: 'proctoring-session-3',
        entrySessionId: 'entry-session-3',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator: new ProctoringEventValidatorService(),
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock('socket-3');
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-3',
      clientSessionId: 'client-3',
      userId: 'candidate-3',
      lastSeenClientSeq: 0,
    });

    await socket.handlers['final_flush.request']?.({
      participationId: 'participation-3',
      clientSessionId: 'client-3',
      submitAttemptId: 'attempt-3',
      expectedEventCount: 5,
      acceptedCount: 3,
      firstClientSeq: 1,
      lastClientSeq: 3,
      clientSeq: 4,
      capturedAt: '2026-06-11T10:00:00.000Z',
    });

    expect(redisService.appendTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shard: 0,
        event: expect.objectContaining({
          type: 'final_flush.request',
          examId: 'exam-3',
          sessionId: 'proctoring-session-3',
          entrySessionId: 'entry-session-3',
          candidateUserId: 'candidate-3',
          receivedAt: expect.any(String),
          payloadJson: expect.objectContaining({
            submitAttemptId: 'attempt-3',
            expectedEventCount: 5,
          }),
        }),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.ack',
      expect.objectContaining({ acceptedCount: 1 }),
    );
  });

  it('still allows client payload to omit server-owned fields', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '5-0',
      }),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-4',
        clientSessionId: 'client-4',
        userId: 'candidate-4',
        lastSeenClientSeq: 0,
      }),
      validateTelemetryFrame: jest.fn().mockImplementation(frame => ({
        ...frame,
        payloadJson: { eventName: 'typing' },
      })),
      validateFinalFlushRequest: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-4',
        userId: 'candidate-4',
        examId: 'exam-4',
        participationId: 'participation-4',
        clientSessionId: 'client-4',
        proctoringSessionId: 'proctoring-session-4',
        entrySessionId: 'entry-session-4',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock('socket-4');
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-4',
      clientSessionId: 'client-4',
      userId: 'candidate-4',
      lastSeenClientSeq: 0,
    });

    await socket.handlers['telemetry.batch']?.({
      participationId: 'participation-4',
      clientSessionId: 'client-4',
      events: [
        {
          type: 'telemetry.batch',
          participationId: 'participation-4',
          clientSessionId: 'client-4',
          clientSeq: 1,
          capturedAt: '2026-06-11T10:00:00.000Z',
          receivedAt: '2026-06-11T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { eventName: 'typing' },
        },
      ],
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.ack',
      expect.objectContaining({ acceptedCount: 1 }),
    );
    expect(socket.emit).not.toHaveBeenCalledWith('session.suspended', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('telemetry.retry_required', expect.anything());
  });

  it('rejects forbidden payload fields with session.suspended', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const { ProctoringEventValidatorService } = require('../../../apps/api/src/services/proctoring/proctoring-event-validator.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '6-0',
      }),
      suspendParticipation: jest.fn(),
      emitSessionSignal: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-5',
        userId: 'candidate-5',
        examId: 'exam-5',
        participationId: 'participation-5',
        clientSessionId: 'client-5',
        proctoringSessionId: 'proctoring-session-5',
        entrySessionId: 'entry-session-5',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator: new ProctoringEventValidatorService(),
      rateLimitService,
      socketTokenService,
    });

    const socket = createSocketMock('socket-5');
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-5',
      clientSessionId: 'client-5',
      userId: 'candidate-5',
      lastSeenClientSeq: 0,
    });

    await socket.handlers['telemetry.urgent']?.({
      participationId: 'participation-5',
      clientSessionId: 'client-5',
      event: {
        type: 'telemetry.urgent',
        participationId: 'participation-5',
        clientSessionId: 'client-5',
        clientSeq: 1,
        capturedAt: '2026-06-11T10:00:00.000Z',
        receivedAt: '2026-06-11T10:00:01.000Z',
        schemaVersion: 1,
        severity: 'info',
        payloadJson: { rawmedia: 'http://evil.com/screenshot.png' },
      },
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'session.suspended',
      expect.objectContaining({
        reason: expect.stringContaining('Forbidden payload fields'),
      }),
    );
    expect(redisService.appendTelemetryEvent).not.toHaveBeenCalled();
  });

  it('rejects session.hello before joining or upserting state when the socket token is missing', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn(),
      appendTelemetryEvent: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        userId: 'candidate-1',
        lastSeenClientSeq: 0,
      }),
      validateTelemetryFrame: jest.fn(),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService: {
        allowBatch: jest.fn().mockReturnValue({ allowed: true }),
        isStaleBufferedEvent: jest.fn().mockReturnValue(false),
      },
      socketTokenService: {
        verifyTokenForHello: jest.fn(),
      },
    });

    const socket = createSocketMock('socket-1', {});
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 0,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'session.rejected',
      expect.objectContaining({ reason: 'invalid_proctoring_socket_token' }),
    );
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(redisService.upsertSessionState).not.toHaveBeenCalled();
  });

  it('rejects session.hello before joining or upserting state when token verification fails', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn(),
      appendTelemetryEvent: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        userId: 'candidate-1',
        lastSeenClientSeq: 0,
      }),
      validateTelemetryFrame: jest.fn(),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockRejectedValue(new Error('token mismatch')),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService: {
        allowBatch: jest.fn().mockReturnValue({ allowed: true }),
        isStaleBufferedEvent: jest.fn().mockReturnValue(false),
      },
      socketTokenService,
    });

    const socket = createSocketMock();
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 0,
    });

    expect(socketTokenService.verifyTokenForHello).toHaveBeenCalledWith({
      token: 'socket-token',
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'session.rejected',
      expect.objectContaining({ reason: 'invalid_proctoring_socket_token' }),
    );
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(redisService.upsertSessionState).not.toHaveBeenCalled();
  });

  it('rejects session.hello before joining or upserting state when token claims omit proctoringSessionId', async () => {
    const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');
    const namespace = createNamespaceMock();
    const redisService = {
      upsertSessionState: jest.fn(),
      appendTelemetryEvent: jest.fn(),
    };
    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'participation-6',
        clientSessionId: 'client-6',
        userId: 'candidate-6',
        lastSeenClientSeq: 0,
      }),
      validateTelemetryFrame: jest.fn(),
    };
    const socketTokenService = {
      verifyTokenForHello: jest.fn().mockResolvedValue({
        sub: 'candidate-6',
        userId: 'candidate-6',
        examId: 'exam-6',
        participationId: 'participation-6',
        clientSessionId: 'client-6',
      }),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService: {
        allowBatch: jest.fn().mockReturnValue({ allowed: true }),
        isStaleBufferedEvent: jest.fn().mockReturnValue(false),
      },
      socketTokenService,
    });

    const socket = createSocketMock('socket-6');
    namespace.handlers.connection(socket);
    await socket.handlers['session.hello']?.({
      participationId: 'participation-6',
      clientSessionId: 'client-6',
      userId: 'candidate-6',
      lastSeenClientSeq: 0,
    });

    expect(socketTokenService.verifyTokenForHello).toHaveBeenCalledWith({
      token: 'socket-token',
      participationId: 'participation-6',
      clientSessionId: 'client-6',
      userId: 'candidate-6',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'session.rejected',
      expect.objectContaining({ reason: 'invalid_proctoring_socket_token' }),
    );
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(redisService.upsertSessionState).not.toHaveBeenCalled();
  });
});
