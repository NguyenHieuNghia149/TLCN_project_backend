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

    jest.doMock('@backend/shared/utils', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
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

    jest.doMock('@backend/shared/utils', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
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

    expect(loadSync).toHaveBeenCalledTimes(1);
    expect(loadPackageDefinition).toHaveBeenCalledTimes(1);
    expect(sandboxServiceCtor).toHaveBeenCalledTimes(2);
    expect(createInsecure).toHaveBeenCalledTimes(2);

    clientA.close();
    clientB.close();
    expect(closeClient).toHaveBeenCalledTimes(2);
  });
});


