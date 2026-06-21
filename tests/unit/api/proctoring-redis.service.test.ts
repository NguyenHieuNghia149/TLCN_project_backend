function loadRedisServiceModule() {
  const redisInstances: Array<{
    hset: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    get: jest.Mock;
    xadd: jest.Mock;
    ping: jest.Mock;
    quit: jest.Mock;
    on: jest.Mock;
  }> = [];

  const RedisMock = jest.fn().mockImplementation(() => {
    const instance = {
      hset: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      xadd: jest.fn().mockResolvedValue('1-0'),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn().mockReturnThis(),
    };
    redisInstances.push(instance);
    return instance;
  });

  jest.doMock('ioredis', () => ({
    __esModule: true,
    default: RedisMock,
  }));
  jest.doMock('@backend/shared/utils', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  let module!: any;
  jest.isolateModules(() => {
    module = require('../../../apps/api/src/services/proctoring/proctoring-redis.service');
  });

  return { module, RedisMock, redisInstances };
}

describe('ProctoringRedisService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PROCTORING_REDIS_URL;
    delete process.env.REDIS_CACHE_URL;
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the proctoring Redis URL before cache and generic Redis URLs', async () => {
    process.env.PROCTORING_REDIS_URL = 'redis://proctoring:6379/5';
    process.env.REDIS_CACHE_URL = 'redis://cache:6379/0';
    process.env.REDIS_URL = 'redis://generic:6379/0';
    const { module, RedisMock } = loadRedisServiceModule();

    const service = module.createProctoringRedisService();

    expect(RedisMock).not.toHaveBeenCalled();

    await service.connect();

    expect(RedisMock).toHaveBeenCalledWith('redis://proctoring:6379/5', {
      maxRetriesPerRequest: null,
    });
  });

  it('reports Redis buffer health from ping', async () => {
    const { module, redisInstances } = loadRedisServiceModule();
    const service = module.createProctoringRedisService();

    await expect(service.healthCheck()).resolves.toBe(true);

    expect(redisInstances[0]!.ping).toHaveBeenCalled();
  });

  it('reports unhealthy when Redis ping fails', async () => {
    const { module } = loadRedisServiceModule();
    const service = new module.ProctoringRedisService({
      createClient: () => ({
        hset: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        get: jest.fn(),
        xadd: jest.fn(),
        ping: jest.fn().mockRejectedValue(new Error('connection refused')),
        quit: jest.fn(),
        on: jest.fn().mockReturnThis(),
      }),
    });

    await expect(service.healthCheck()).resolves.toBe(false);
  });

  it('upserts live session hashes and server-owned deadline TTL keys', async () => {
    const { module, redisInstances } = loadRedisServiceModule();
    const service = module.createProctoringRedisService();
    const now = new Date('2026-06-11T10:00:00.000Z');
    const deadlineAt = new Date('2026-06-11T10:00:30.000Z');

    await service.upsertSessionState({
      participationId: 'participation-1',
      sessionId: 'session-1',
      clientSessionId: 'client-1',
      status: 'active',
      lastSeenAt: now,
      lastAcceptedClientSeq: 42,
    });
    await service.setDeadline({
      participationId: 'participation-1',
      deadlineType: 'missed_heartbeat',
      deadlineAt,
      now,
    });

    expect(redisInstances[0]!.hset).toHaveBeenCalledWith(
      'proctoring:session:participation-1',
      expect.objectContaining({
        sessionId: 'session-1',
        clientSessionId: 'client-1',
        status: 'active',
        lastSeenAt: now.toISOString(),
        lastAcceptedClientSeq: '42',
      }),
    );
    expect(redisInstances[0]!.set).toHaveBeenCalledWith(
      'proctoring:deadline:participation-1',
      JSON.stringify({
        participationId: 'participation-1',
        deadlineType: 'missed_heartbeat',
        deadlineAt: deadlineAt.toISOString(),
      }),
      'PX',
      30000,
    );
  });

  it('appends telemetry to a shard stream without serializing raw sensitive content', async () => {
    const { module, redisInstances } = loadRedisServiceModule();
    const service = module.createProctoringRedisService();

    const result = await service.appendTelemetryEvent({
      shard: 3,
      event: {
        id: 'event-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        sessionId: 'session-1',
        candidateUserId: 'candidate-1',
        clientSessionId: 'client-1',
        clientSeq: 7,
        type: 'clipboard_event',
        severity: 'info',
        schemaVersion: 1,
        payloadJson: {
          action: 'paste',
          rawClipboardText: 'secret text',
          sourceCode: 'print("secret")',
        },
        capturedAt: '2026-06-11T10:00:00.000Z',
        receivedAt: '2026-06-11T10:00:01.000Z',
      },
    });

    const [, , , serialized] = redisInstances[0]!.xadd.mock.calls[0]!;

    expect(result).toEqual({
      redisId: '1-0',
      streamKey: 'proctoring:telemetry:stream:3',
    });
    expect(redisInstances[0]!.xadd).toHaveBeenCalledWith(
      'proctoring:telemetry:stream:3',
      '*',
      'event',
      expect.any(String),
    );
    expect(serialized).toContain('"action":"paste"');
    expect(serialized).not.toContain('secret text');
    expect(serialized).not.toContain('print("secret")');
  });
});
