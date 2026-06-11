function createRedisMock() {
  return {
    xgroup: jest.fn().mockResolvedValue('OK'),
    xreadgroup: jest.fn().mockResolvedValue(null),
    xautoclaim: jest.fn().mockResolvedValue(['0-0', []]),
    xack: jest.fn().mockResolvedValue(1),
    xadd: jest.fn().mockResolvedValue('dead-1'),
  };
}

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    examId: 'exam-1',
    participationId: 'participation-1',
    sessionId: 'session-1',
    entrySessionId: null,
    candidateUserId: 'candidate-1',
    clientSessionId: 'client-1',
    clientSeq: 1,
    type: 'final_flush.request',
    severity: 'info',
    schemaVersion: 1,
    payloadJson: { expectedEventCount: 1 },
    capturedAt: '2026-06-11T10:00:00.000Z',
    receivedAt: '2026-06-11T10:00:01.000Z',
    finalFlushReceiptId: 'receipt-1',
    ...overrides,
  };
}

function encodeEntry(id: string, event: unknown) {
  return [id, ['event', typeof event === 'string' ? event : JSON.stringify(event)]];
}

function createPersister(deps: Record<string, unknown> = {}) {
  const {
    ProctoringTelemetryPersisterService,
  } = require('../../../apps/api/src/services/proctoring/proctoring-telemetry-persister.service');
  const redis = (deps.redis ?? createRedisMock()) as ReturnType<typeof createRedisMock>;
  const eventRepository = (deps.eventRepository ?? {
    bulkInsertDedupe: jest.fn().mockResolvedValue({
      inserted: [createEvent()],
      insertedCount: 1,
      dedupedCount: 0,
    }),
  }) as { bulkInsertDedupe: jest.Mock };
  const finalFlushRepository = (deps.finalFlushRepository ?? {
    transitionStatus: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
  }) as { transitionStatus: jest.Mock };
  const summaryRepository = (deps.summaryRepository ?? {
    upsertForParticipation: jest.fn().mockResolvedValue({ id: 'summary-1' }),
  }) as { upsertForParticipation: jest.Mock };
  const service = new ProctoringTelemetryPersisterService({
    redis,
    eventRepository,
    finalFlushRepository,
    summaryRepository,
    streamShard: 0,
    consumerName: 'api-test',
    batchSize: 10,
    blockMs: 1,
    ...(deps.options ?? {}),
  });

  return { service, redis, eventRepository, finalFlushRepository, summaryRepository };
}

describe('ProctoringTelemetryPersisterService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
  });

  it('bootstraps the Redis Stream consumer group idempotently', async () => {
    const { service, redis } = createPersister();

    await service.bootstrapConsumerGroup();
    redis.xgroup.mockRejectedValueOnce(new Error('BUSYGROUP Consumer Group name already exists'));
    await service.bootstrapConsumerGroup();

    expect(redis.xgroup).toHaveBeenCalledWith(
      'CREATE',
      'proctoring:telemetry:stream:0',
      'proctoring-telemetry-persisters',
      '0',
      'MKSTREAM',
    );
    expect(redis.xgroup).toHaveBeenCalledTimes(2);
  });

  it('bulk inserts events, marks final-flush receipts persisted, then XACKs after durable write', async () => {
    const event = createEvent();
    const redis = createRedisMock();
    redis.xreadgroup.mockResolvedValue([
      ['proctoring:telemetry:stream:0', [encodeEntry('1-0', event)]],
    ]);
    const { service, eventRepository, finalFlushRepository, summaryRepository } = createPersister({
      redis,
    });

    const result = await service.processBatchOnce();

    expect(result).toEqual({
      processedCount: 1,
      insertedCount: 1,
      dedupedCount: 0,
      deadLetterCount: 0,
    });
    expect(finalFlushRepository.transitionStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        receiptId: 'receipt-1',
        fromStatuses: ['received', 'persisting'],
        toStatus: 'persisting',
      }),
    );
    expect(eventRepository.bulkInsertDedupe).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'event-1',
        buffered: true,
        capturedAt: new Date('2026-06-11T10:00:00.000Z'),
        receivedAt: new Date('2026-06-11T10:00:01.000Z'),
      }),
    ]);
    expect(summaryRepository.upsertForParticipation).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        participationId: 'participation-1',
        finalFlushStatus: 'persisted',
      }),
    );
    expect(finalFlushRepository.transitionStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        receiptId: 'receipt-1',
        fromStatuses: ['received', 'persisting'],
        toStatus: 'persisted',
        counts: { acceptedCount: 1, dedupedCount: 0, persistedCount: 1 },
      }),
    );
    expect(redis.xack).toHaveBeenCalledWith(
      'proctoring:telemetry:stream:0',
      'proctoring-telemetry-persisters',
      '1-0',
    );
    const xackOrder = redis.xack.mock.invocationCallOrder[0] as number;
    const durableWriteOrder = eventRepository.bulkInsertDedupe.mock.invocationCallOrder[0] as number;
    expect(xackOrder).toBeGreaterThan(durableWriteOrder);
  });

  it('does not XACK entries when PostgreSQL durable write fails', async () => {
    const redis = createRedisMock();
    redis.xreadgroup.mockResolvedValue([
      ['proctoring:telemetry:stream:0', [encodeEntry('1-0', createEvent())]],
    ]);
    const eventRepository = {
      bulkInsertDedupe: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const { service } = createPersister({ redis, eventRepository });

    await expect(service.processBatchOnce()).rejects.toThrow('database unavailable');

    expect(redis.xack).not.toHaveBeenCalled();
  });

  it('dead-letters malformed stream entries and acknowledges only the malformed Redis message', async () => {
    const redis = createRedisMock();
    redis.xreadgroup.mockResolvedValue([
      ['proctoring:telemetry:stream:0', [encodeEntry('bad-1', '{not-json')]],
    ]);
    const { service, eventRepository } = createPersister({ redis });

    const result = await service.processBatchOnce();

    expect(result.deadLetterCount).toBe(1);
    expect(eventRepository.bulkInsertDedupe).not.toHaveBeenCalled();
    expect(redis.xadd).toHaveBeenCalledWith(
      'proctoring:telemetry:dead-letter',
      '*',
      'sourceStream',
      'proctoring:telemetry:stream:0',
      'sourceId',
      'bad-1',
      'error',
      expect.stringContaining('Invalid'),
      'raw',
      '{not-json',
    );
    expect(redis.xack).toHaveBeenCalledWith(
      'proctoring:telemetry:stream:0',
      'proctoring-telemetry-persisters',
      'bad-1',
    );
  });

  it('recovers a crash after durable insert but before XACK through XAUTOCLAIM idempotency', async () => {
    const event = createEvent();
    const eventRepository = {
      bulkInsertDedupe: jest
        .fn()
        .mockResolvedValueOnce({ inserted: [event], insertedCount: 1, dedupedCount: 0 })
        .mockResolvedValueOnce({ inserted: [], insertedCount: 0, dedupedCount: 1 }),
    };
    const finalFlushRepository = {
      transitionStatus: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
    };
    const redisA = createRedisMock();
    redisA.xreadgroup.mockResolvedValue([
      ['proctoring:telemetry:stream:0', [encodeEntry('1-0', event)]],
    ]);
    const first = createPersister({
      redis: redisA,
      eventRepository,
      finalFlushRepository,
      options: {
        afterDurableWriteBeforeAck: jest.fn().mockRejectedValue(new Error('simulated crash')),
      },
    });

    await expect(first.service.processBatchOnce()).rejects.toThrow('simulated crash');
    expect(redisA.xack).not.toHaveBeenCalled();

    const redisB = createRedisMock();
    redisB.xautoclaim.mockResolvedValue([
      '0-0',
      [encodeEntry('1-0', event)],
      [],
    ]);
    const second = createPersister({
      redis: redisB,
      eventRepository,
      finalFlushRepository,
    });

    const result = await second.service.recoverPendingOnce();

    expect(result).toMatchObject({
      processedCount: 1,
      insertedCount: 0,
      dedupedCount: 1,
    });
    expect(eventRepository.bulkInsertDedupe).toHaveBeenCalledTimes(2);
    expect(finalFlushRepository.transitionStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        receiptId: 'receipt-1',
        toStatus: 'persisted',
        counts: { acceptedCount: 1, dedupedCount: 1, persistedCount: 0 },
      }),
    );
    expect(redisB.xack).toHaveBeenCalledWith(
      'proctoring:telemetry:stream:0',
      'proctoring-telemetry-persisters',
      '1-0',
    );
  });
});
