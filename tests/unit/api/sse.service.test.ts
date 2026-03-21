import type { ISubmissionEventStream } from '@backend/api/services/sse.service';

/** Loads the SSE module with a mocked Redis client so tests can assert lazy initialization. */
function loadSseModule() {
  const redisInstances: Array<{
    subscribe: jest.Mock;
    on: jest.Mock;
    quit: jest.Mock;
  }> = [];
  const RedisMock = jest.fn().mockImplementation(() => {
    const instance = {
      subscribe: jest.fn(),
      on: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    redisInstances.push(instance);
    return instance;
  });

  jest.doMock('@backend/shared/utils', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  }));
  jest.doMock('ioredis', () => ({
    __esModule: true,
    default: RedisMock,
  }));

  let sseModule!: typeof import('../../../apps/api/src/services/sse.service');
  jest.isolateModules(() => {
    sseModule = require('../../../apps/api/src/services/sse.service');
  });

  return { sseModule, RedisMock, redisInstances };
}

describe('lazy SSE service bootstrap', () => {
  let resetSseServiceForTesting: (() => Promise<void>) | undefined;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    resetSseServiceForTesting = undefined;
  });

  afterEach(async () => {
    if (resetSseServiceForTesting) {
      await resetSseServiceForTesting();
    }
  });

  it('does not create a Redis subscriber on module import', () => {
    const { sseModule, RedisMock } = loadSseModule();
    resetSseServiceForTesting = sseModule.resetSseServiceForTesting;

    expect(RedisMock).not.toHaveBeenCalled();
  });

  it('creates a fresh Redis-backed SSE service through the factory', () => {
    const { sseModule, RedisMock } = loadSseModule();
    resetSseServiceForTesting = sseModule.resetSseServiceForTesting;

    const first = sseModule.createSseService();
    const second = sseModule.createSseService();

    expect(RedisMock).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });

  it('initializes the Redis-backed SSE service only once', () => {
    const { sseModule, RedisMock } = loadSseModule();
    resetSseServiceForTesting = sseModule.resetSseServiceForTesting;

    const first = sseModule.getSseService();
    const second = sseModule.getSseService();

    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('disconnects and clears the cached instance during test reset', async () => {
    const { sseModule, RedisMock, redisInstances } = loadSseModule();
    resetSseServiceForTesting = sseModule.resetSseServiceForTesting;

    const first = sseModule.getSseService();
    await sseModule.resetSseServiceForTesting();
    const second = sseModule.getSseService();

    expect(redisInstances).toHaveLength(2);
    expect(redisInstances[0]!.quit).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });
});