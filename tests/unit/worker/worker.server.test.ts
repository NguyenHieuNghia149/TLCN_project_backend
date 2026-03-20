describe('worker server bootstrap factories', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('does not start the worker or register handlers on module import', () => {
    const config = jest.fn();
    const createSandboxGrpcClient = jest.fn();
    const createWorkerService = jest.fn();
    const createSandboxBreaker = jest.fn();
    const processOnSpy = jest.spyOn(process, 'on');

    const initialSigintListeners = process.listenerCount('SIGINT');
    const initialSigtermListeners = process.listenerCount('SIGTERM');
    const initialUncaughtListeners = process.listenerCount('uncaughtException');
    const initialUnhandledListeners = process.listenerCount('unhandledRejection');

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('dotenv', () => ({ config }));
    jest.doMock('../../../apps/worker/src/grpc/client', () => ({ createSandboxGrpcClient }));
    jest.doMock('../../../apps/worker/src/services/worker.service', () => ({ createWorkerService }));
    jest.doMock('../../../apps/worker/src/grpc/circuit-breaker', () => ({
      createSandboxBreaker,
    }));

    jest.isolateModules(() => {
      require('../../../apps/worker/src/worker.server');
    });

    expect(config).not.toHaveBeenCalled();
    expect(createSandboxGrpcClient).not.toHaveBeenCalled();
    expect(createWorkerService).not.toHaveBeenCalled();
    expect(createSandboxBreaker).not.toHaveBeenCalled();
    expect(processOnSpy).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners);
    expect(process.listenerCount('uncaughtException')).toBe(initialUncaughtListeners);
    expect(process.listenerCount('unhandledRejection')).toBe(initialUnhandledListeners);
  });

  it('wires config, client, breaker, handlers, and service start in order', async () => {
    const calls: string[] = [];    const sandboxClient = {
      close: jest.fn(),
    };
    const createSandboxGrpcClient = jest.fn(() => {
      calls.push('client');
      return sandboxClient;
    });
    const workerService = {
      start: jest.fn(async () => {
        calls.push('start');
      }),
      stop: jest.fn(async () => undefined),
    };
    const createWorkerService = jest.fn(({ sandboxClient: receivedSandboxClient }) => {
      expect(receivedSandboxClient).toBe(sandboxClient);
      calls.push('service');
      return workerService;
    });
    const createSandboxBreaker = jest.fn();
    const processOnSpy = jest
      .spyOn(process, 'on')
      .mockImplementation((() => process) as any);

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('../../../apps/worker/src/grpc/client', () => ({ createSandboxGrpcClient }));
    jest.doMock('../../../apps/worker/src/services/worker.service', () => ({ createWorkerService }));
    jest.doMock('../../../apps/worker/src/grpc/circuit-breaker', () => ({
      createSandboxBreaker,
    }));

    let startWorkerProcess!: () => Promise<void>;
    jest.isolateModules(() => {
      ({ startWorkerProcess } = require('../../../apps/worker/src/worker.server'));
    });

    await startWorkerProcess();

    expect(calls).toEqual(['client', 'service', 'start']);    expect(createSandboxGrpcClient.mock.invocationCallOrder[0]!).toBeLessThan(
      createWorkerService.mock.invocationCallOrder[0]!
    );
    expect(createWorkerService.mock.invocationCallOrder[0]!).toBeLessThan(
      workerService.start.mock.invocationCallOrder[0]!
    );
    expect(createWorkerService).toHaveBeenCalledWith({
      sandboxClient,
      createBreaker: createSandboxBreaker,
    });
    expect(processOnSpy.mock.calls.map(call => call[0])).toEqual([
      'SIGINT',
      'SIGTERM',
      'uncaughtException',
      'unhandledRejection',
    ]);
    expect(workerService.start).toHaveBeenCalledTimes(1);
  });
});

