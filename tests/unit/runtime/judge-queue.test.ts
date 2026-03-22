const mockQueues: Array<{
  add: jest.Mock;
  getJob: jest.Mock;
  count: jest.Mock;
  obliterate: jest.Mock;
  close: jest.Mock;
}> = [];
const mockRedisClients: Array<{
  on: jest.Mock;
  ping: jest.Mock;
  publish: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;
  status: string;
}> = [];

jest.mock('bullmq', () => {
  const Queue = jest.fn().mockImplementation(() => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'submission-1' }),
      getJob: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      obliterate: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockQueues.push(queue);
    return queue;
  });

  return {
    Queue,
    Job: class MockJob {},
  };
});

jest.mock('ioredis', () => {
  const Redis = jest.fn().mockImplementation(() => {
    const client = {
      on: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      status: 'ready',
    };
    mockRedisClients.push(client);
    return client;
  });

  return Redis;
});

describe('JudgeQueueService lazy initialization', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockQueues.length = 0;
    mockRedisClients.length = 0;
  });

  it('does not create Redis or BullMQ clients on module import', () => {
    const Queue = require('bullmq').Queue as jest.Mock;
    const Redis = require('ioredis') as jest.Mock;

    require('../../../packages/shared/runtime/judge-queue');

    expect(Queue).not.toHaveBeenCalled();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('does not create clients when only retrieving the lazy accessor', () => {
    const Queue = require('bullmq').Queue as jest.Mock;
    const Redis = require('ioredis') as jest.Mock;
    const runtime = require('../../../packages/shared/runtime/judge-queue');

    const service = runtime.getJudgeQueueService();

    expect(service).toBeDefined();
    expect(Queue).not.toHaveBeenCalled();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('creates fresh judge queue services without initializing clients at construction time', () => {
    const Queue = require('bullmq').Queue as jest.Mock;
    const Redis = require('ioredis') as jest.Mock;
    const runtime = require('../../../packages/shared/runtime/judge-queue');

    const first = runtime.createJudgeQueueService();
    const second = runtime.createJudgeQueueService();

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(Queue).not.toHaveBeenCalled();
    expect(Redis).not.toHaveBeenCalled();
  });

  it('uses injected factories lazily and keeps connect idempotent', async () => {
    const runtime = require('../../../packages/shared/runtime/judge-queue') as typeof import('../../../packages/shared/runtime/judge-queue');
    const mockQueue = {
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    const mockPublisher = {
      on: jest.fn().mockReturnThis(),
      ping: jest.fn().mockResolvedValue('PONG'),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    } as any;
    const createQueue = jest.fn(() => mockQueue);
    const createPublisher = jest.fn(() => mockPublisher);
    const service = new runtime.JudgeQueueService({ createQueue, createPublisher });

    expect(createQueue).not.toHaveBeenCalled();
    expect(createPublisher).not.toHaveBeenCalled();

    await service.connect();
    await service.connect();

    expect(createQueue).toHaveBeenCalledTimes(1);
    expect(createPublisher).toHaveBeenCalledTimes(1);
    expect(mockPublisher.on).toHaveBeenCalledTimes(1);
  });

  it('disconnect is a no-op when the service was never initialized', async () => {
    const runtime = require('../../../packages/shared/runtime/judge-queue');
    const service = runtime.getJudgeQueueService();

    await expect(service.disconnect()).resolves.toBeUndefined();
    expect(mockQueues).toHaveLength(0);
    expect(mockRedisClients).toHaveLength(0);
  });

  it('resetJudgeQueueServiceForTesting returns a fresh instance', async () => {
    const runtime = require('../../../packages/shared/runtime/judge-queue');
    const first = runtime.getJudgeQueueService();

    await first.connect();
    await runtime.resetJudgeQueueServiceForTesting();

    const second = runtime.getJudgeQueueService();

    expect(second).not.toBe(first);
  });

  it('getQueue lazily initializes a queue for Bull Board consumers', () => {
    const runtime = require('../../../packages/shared/runtime/judge-queue') as typeof import('../../../packages/shared/runtime/judge-queue');
    const mockQueue = {
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    const mockPublisher = {
      on: jest.fn().mockReturnThis(),
      ping: jest.fn().mockResolvedValue('PONG'),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    } as any;
    const createQueue = jest.fn(() => mockQueue);
    const createPublisher = jest.fn(() => mockPublisher);
    const service = new runtime.JudgeQueueService({ createQueue, createPublisher });

    const queue = (service as any)['getQueue']();

    expect(queue).toBe(mockQueue);
    expect(createQueue).toHaveBeenCalledTimes(1);
    expect(createPublisher).toHaveBeenCalledTimes(1);
  });

  it('lazily initializes queue methods and returns queue status', async () => {
    const runtime = require('../../../packages/shared/runtime/judge-queue');
    const service = runtime.getJudgeQueueService();

    await service.addJob({
      submissionId: 'submission-1',
      userId: 'user-1',
      problemId: 'problem-1',
      code: 'print(1)',
      language: 'python',
      functionSignature: {
        name: 'solve',
        args: [],
        returnType: { type: 'integer' },
      },
      testcases: [],
      timeLimit: 1000,
      memoryLimit: '128m',
      createdAt: new Date().toISOString(),
    });

    mockQueues[0]!.getJob.mockResolvedValue({ id: 'submission-1' });
    mockQueues[0]!.count.mockResolvedValue(3);

    const job = await service.getJobById('submission-1');
    const status = await service.getQueueStatus();

    expect(job).toEqual({ id: 'submission-1' });
    expect(status).toEqual({ length: 3, isHealthy: true });
    expect(mockQueues[0]!.add).toHaveBeenCalledTimes(1);
    expect(mockRedisClients[1]!.ping).toHaveBeenCalledTimes(1);
  });
});

