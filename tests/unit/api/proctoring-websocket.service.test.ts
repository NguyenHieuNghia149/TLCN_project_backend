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

function createSocketMock(id = 'socket-1') {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    id,
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

    const service = new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
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
        payloadJson: { action: 'paste' },
      })),
      validateFinalFlushRequest: jest.fn(),
    };
    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
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
            action: 'paste',
            rawClipboardText: 'secret text',
          },
        },
      ],
    });

    expect(redisService.appendTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shard: 0,
        event: expect.objectContaining({
          participationId: 'participation-1',
          clientSeq: 7,
          payloadJson: { action: 'paste' },
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

    new ProctoringWebSocketService({
      namespace,
      redisService,
      validator,
      rateLimitService,
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
});
