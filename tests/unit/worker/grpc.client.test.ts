describe('worker grpc client lazy bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('does not load proto or create stub on module import', () => {
    const loadSync = jest.fn();
    const sandboxServiceCtor = jest.fn();
    const loadPackageDefinition = jest.fn(() => ({
      judge: {
        SandboxService: sandboxServiceCtor,
      },
    }));

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('@grpc/proto-loader', () => ({ loadSync }));
    jest.doMock('@grpc/grpc-js', () => ({
      loadPackageDefinition,
      credentials: { createInsecure: jest.fn(() => ({})) },
      closeClient: jest.fn(),
    }));

    jest.isolateModules(() => {
      require('../../../apps/worker/src/grpc/client');
    });

    expect(loadSync).not.toHaveBeenCalled();
    expect(loadPackageDefinition).not.toHaveBeenCalled();
    expect(sandboxServiceCtor).not.toHaveBeenCalled();
  });

  it('wraps callback-style stub execution and closes the injected stub', async () => {
    const closeClient = jest.fn();
    const fakeResponse = {
      submission_id: 'submission-1',
      overall_status: 'ACCEPTED',
      compile_error: '',
      results: [],
    };

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('@grpc/proto-loader', () => ({ loadSync: jest.fn() }));
    jest.doMock('@grpc/grpc-js', () => ({
      loadPackageDefinition: jest.fn(),
      credentials: { createInsecure: jest.fn(() => ({})) },
      closeClient,
    }));

    let SandboxGrpcClient!: typeof import('../../../apps/worker/src/grpc/client').SandboxGrpcClient;
    jest.isolateModules(() => {
      ({ SandboxGrpcClient } = require('../../../apps/worker/src/grpc/client'));
    });

    const ExecuteCode = jest.fn((request, callback) => callback(null, fakeResponse));
    const client = new SandboxGrpcClient({
      sandboxAddress: 'sandbox:50051',
      stub: { ExecuteCode } as any,
    });

    await expect(
      client.executeCode({
        submission_id: 'submission-1',
        source_code: 'print(1)',
        language: 'python',
        time_limit_ms: 1000,
        memory_limit_kb: 65536,
        test_cases: [],
      })
    ).resolves.toEqual(fakeResponse);

    expect(ExecuteCode).toHaveBeenCalledTimes(1);

    client.close();
    expect(closeClient).toHaveBeenCalledTimes(1);
    expect(closeClient).toHaveBeenCalledWith(expect.objectContaining({ ExecuteCode }));
  });

  it('loads proto lazily and caches it across client creation', () => {
    const loadSync = jest.fn(() => ({ proto: true }));
    const executeCode = jest.fn();
    const sandboxServiceCtor = jest.fn(() => ({ ExecuteCode: executeCode }));
    const loadPackageDefinition = jest.fn(() => ({
      judge: {
        SandboxService: sandboxServiceCtor,
      },
    }));
    const createInsecure = jest.fn(() => ({}));
    const closeClient = jest.fn();

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('@grpc/proto-loader', () => ({ loadSync }));
    jest.doMock('@grpc/grpc-js', () => ({
      loadPackageDefinition,
      credentials: { createInsecure },
      closeClient,
    }));

    let createSandboxGrpcClient!: typeof import('../../../apps/worker/src/grpc/client').createSandboxGrpcClient;
    jest.isolateModules(() => {
      ({ createSandboxGrpcClient } = require('../../../apps/worker/src/grpc/client'));
    });

    const clientA = createSandboxGrpcClient();
    const clientB = createSandboxGrpcClient();

    expect(clientA).not.toBe(clientB);
    expect(loadSync).toHaveBeenCalledTimes(1);
    expect(loadPackageDefinition).toHaveBeenCalledTimes(1);
    expect(sandboxServiceCtor).toHaveBeenCalledTimes(2);
    expect(createInsecure).toHaveBeenCalledTimes(2);

    clientA.close();
    clientB.close();
    expect(closeClient).toHaveBeenCalledTimes(2);
  });
});
