import { DatabaseService } from '@backend/shared/db/connection';

const describeDbIntegration =
  process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

describeDbIntegration('Proctoring P1.T10.4 — Submit while final flush is in flight', () => {
  beforeAll(async () => {
    await DatabaseService.connect();
  });

  afterAll(async () => {
    await DatabaseService.disconnect();
  });

  it('submit guard polls through received/persisting and completes on persisted', async () => {
    const { ProctoringSubmitGuardService } = require('../../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');

    let receiptStatus = 'received';
    const receipt = { id: 'receipt-1', status: () => receiptStatus };

    const finalFlushRepository = {
      findById: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'receipt-1') {
          return { id: 'receipt-1', status: receiptStatus };
        }
        return null;
      }),
      findByParticipationAndSubmitAttempt: jest.fn().mockImplementation(async () => {
        return { id: 'receipt-1', status: receiptStatus };
      }),
      transitionStatus: jest.fn().mockResolvedValue(undefined),
    };

    const summaryService = {
      recomputeForParticipation: jest.fn().mockResolvedValue({}),
    };

    const metricsService = {
      recordFinalFlushPollDuration: jest.fn(),
      incrementFinalFlushSuccess: jest.fn(),
      incrementFinalFlushTimeout: jest.fn(),
      incrementFinalFlushFailed: jest.fn(),
    };

    // Simulate the persister transitioning the receipt after 2 polls
    let pollCount = 0;
    const sleep = async (ms: number) => {
      pollCount += 1;
      if (pollCount >= 2) {
        receiptStatus = 'persisted';
      }
    };

    const guard = new ProctoringSubmitGuardService({
      finalFlushRepository,
      summaryService,
      metricsService,
      sleep,
      intervalMs: 10,
      maxAttempts: 10,
    });

    const result = await guard.awaitFinalFlushReceipt({
      participationId: 'p1',
      submitAttemptId: 'attempt-1',
    });

    expect(result.status).toBe('persisted');
    expect(result.receiptId).toBe('receipt-1');
    expect(finalFlushRepository.findByParticipationAndSubmitAttempt).toHaveBeenCalled();
    expect(metricsService.recordFinalFlushPollDuration).toHaveBeenCalled();
    expect(metricsService.incrementFinalFlushSuccess).toHaveBeenCalled();
  });

  it('submit guard records timeout when receipt stays received for 5 seconds', async () => {
    const { ProctoringSubmitGuardService } = require('../../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');

    const finalFlushRepository = {
      findById: jest.fn().mockResolvedValue(null),
      findByParticipationAndSubmitAttempt: jest.fn().mockResolvedValue({
        id: 'receipt-1',
        status: 'received',
      }),
      transitionStatus: jest.fn().mockResolvedValue(undefined),
    };

    const summaryService = {
      recomputeForParticipation: jest.fn().mockResolvedValue({}),
    };

    const metricsService = {
      recordFinalFlushPollDuration: jest.fn(),
      incrementFinalFlushSuccess: jest.fn(),
      incrementFinalFlushTimeout: jest.fn(),
      incrementFinalFlushFailed: jest.fn(),
    };

    const guard = new ProctoringSubmitGuardService({
      finalFlushRepository,
      summaryService,
      metricsService,
      sleep: async (ms: number) => {},
      intervalMs: 10,
      maxAttempts: 3,
    });

    const result = await guard.awaitFinalFlushReceipt({
      participationId: 'p1',
      submitAttemptId: 'attempt-2',
    });

    expect(result.status).toBe('timeout');
    expect(finalFlushRepository.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: 'receipt-1',
        toStatus: 'timeout',
      })
    );
    expect(metricsService.incrementFinalFlushTimeout).toHaveBeenCalled();
  });

  it('submit guard skips when no submitAttemptId or finalFlushReceiptId present', async () => {
    const { ProctoringSubmitGuardService } = require('../../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');

    const guard = new ProctoringSubmitGuardService({
      finalFlushRepository: {
        findById: jest.fn(),
        findByParticipationAndSubmitAttempt: jest.fn(),
        transitionStatus: jest.fn(),
      },
      summaryService: { recomputeForParticipation: jest.fn() },
      metricsService: {
        recordFinalFlushPollDuration: jest.fn(),
        incrementFinalFlushSuccess: jest.fn(),
        incrementFinalFlushTimeout: jest.fn(),
        incrementFinalFlushFailed: jest.fn(),
      },
    });

    const result = await guard.awaitFinalFlushReceipt({
      participationId: 'p1',
    });
    expect(result.status).toBe('skipped');
  });

  it('submit guard returns failed when receipt status is failed', async () => {
    const { ProctoringSubmitGuardService } = require('../../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');

    const finalFlushRepository = {
      findById: jest.fn().mockResolvedValue(null),
      findByParticipationAndSubmitAttempt: jest.fn().mockResolvedValue({
        id: 'receipt-1',
        status: 'failed',
      }),
      transitionStatus: jest.fn(),
    };

    const guard = new ProctoringSubmitGuardService({
      finalFlushRepository,
      summaryService: { recomputeForParticipation: jest.fn().mockResolvedValue({}) },
      metricsService: {
        recordFinalFlushPollDuration: jest.fn(),
        incrementFinalFlushSuccess: jest.fn(),
        incrementFinalFlushTimeout: jest.fn(),
        incrementFinalFlushFailed: jest.fn(),
      },
      intervalMs: 10,
      maxAttempts: 1,
    });

    const result = await guard.awaitFinalFlushReceipt({
      participationId: 'p1',
      submitAttemptId: 'attempt-3',
    });

    expect(result.status).toBe('failed');
  });

  it('final flush service submits events to Redis and creates receipt', async () => {
    const { ProctoringFinalFlushService } = require('../../../../apps/api/src/services/proctoring/proctoring-final-flush.service');

    const participationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'p1', examId: 'exam-1', userId: 'candidate-1',
      }),
    };
    const sessionRepository = {
      findActiveByParticipationAndClientSession: jest.fn().mockResolvedValue({
        id: 'session-1', examId: 'exam-1', participationId: 'p1',
        candidateUserId: 'candidate-1', entrySessionId: 'entry-1',
        clientSessionId: 'client-1',
      }),
    };
    const finalFlushRepository = {
      upsertReceipt: jest.fn().mockResolvedValue({
        id: 'receipt-1', status: 'received',
      }),
    };
    const redisService = {
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0', redisId: '1-0',
      }),
    };

    const service = new ProctoringFinalFlushService({
      participationRepository, sessionRepository, finalFlushRepository, redisService,
    });

    const result = await service.submitFinalFlush('p1', 'candidate-1', {
      clientSessionId: 'client-1',
      submitAttemptId: 'attempt-1',
      expectedEventCount: 1,
      firstClientSeq: 10,
      lastClientSeq: 10,
      events: [{
        type: 'telemetry.batch', participationId: 'p1',
        clientSessionId: 'client-1', clientSeq: 10,
        capturedAt: '2026-06-12T10:00:00.000Z',
        receivedAt: '2026-06-12T10:00:01.000Z',
        schemaVersion: 1, severity: 'info',
        payloadJson: { eventName: 'focus_lost' },
      }],
    });

    expect(result.receiptId).toBe('receipt-1');
    expect(redisService.appendTelemetryEvent).toHaveBeenCalled();
  });

  it('Redis append failure returns retry_required in websocket service', async () => {
    const { ProctoringWebSocketService } = require('../../../../apps/api/src/services/proctoring/proctoring-websocket.service');

    const handlers: Record<string, (...args: any[]) => void> = {};
    const namespace: any = {
      on: jest.fn((event: string, listener: (...args: any[]) => void) => {
        handlers[event] = listener;
        return namespace;
      }),
      emit: jest.fn().mockReturnValue(true),
      to: jest.fn(() => ({ emit: jest.fn().mockReturnValue(true) })),
    };

    const redisService = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      appendTelemetryEvent: jest.fn().mockRejectedValue(new Error('redis_down')),
    };

    const validator = {
      validateSessionHello: jest.fn().mockReturnValue({
        participationId: 'p1', clientSessionId: 'c1', userId: 'u1', lastSeenClientSeq: 0,
      }),
      validateTelemetryFrame: jest.fn().mockImplementation((f: any) => ({
        ...f, participationId: 'p1', clientSessionId: 'c1',
      })),
      validateFinalFlushRequest: jest.fn(),
    };

    const rateLimitService = {
      allowBatch: jest.fn().mockReturnValue({ allowed: true }),
      isStaleBufferedEvent: jest.fn().mockReturnValue(false),
    };

    new ProctoringWebSocketService({ namespace, redisService, validator, rateLimitService });

    const socket = {
      id: 'socket-1', on: jest.fn(), emit: jest.fn().mockReturnValue(true),
      join: jest.fn(), disconnect: jest.fn(),
      handlers: {} as Record<string, (...args: any[]) => void>,
    };
    socket.on = jest.fn((event: string, listener: (...args: any[]) => void) => {
      socket.handlers[event] = listener;
      return socket;
    });
    handlers.connection!(socket);
    await socket.handlers['session.hello']?.({ participationId: 'p1', clientSessionId: 'c1', userId: 'u1', lastSeenClientSeq: 0 });

    await socket.handlers['telemetry.urgent']?.({
      participationId: 'p1', clientSessionId: 'c1',
      event: {
        type: 'telemetry.urgent', participationId: 'p1',
        clientSessionId: 'c1', clientSeq: 1,
        capturedAt: '2026-06-12T10:00:00.000Z',
        receivedAt: '2026-06-12T10:00:01.000Z',
        schemaVersion: 1, severity: 'info',
        payloadJson: {},
      },
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'telemetry.retry_required',
      expect.objectContaining({ reason: 'redis_down' }),
    );
  });
});
