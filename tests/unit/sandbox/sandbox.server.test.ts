import request from 'supertest';
import { createSandboxApp } from '../../../apps/sandbox/src/sandbox.server';
import { ISandboxService } from '../../../apps/sandbox/src/sandbox.service';

describe('sandbox server bootstrap factories', () => {
  const sandboxService: jest.Mocked<ISandboxService> = {
    executeCode: jest.fn(),
    getStatus: jest.fn(),
    healthCheck: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves /api/sandbox/status through the injected service', async () => {
    sandboxService.getStatus.mockReturnValue({
      activeJobs: 1,
      maxConcurrent: 5,
      isHealthy: true,
      uptime: 42,
    });

    const app = createSandboxApp(sandboxService);
    const response = await request(app).get('/api/sandbox/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        activeJobs: 1,
        maxConcurrent: 5,
        isHealthy: true,
        uptime: 42,
      },
    });
    expect(sandboxService.getStatus).toHaveBeenCalledTimes(1);
  });

  it('serves /api/sandbox/health through the injected service', async () => {
    sandboxService.healthCheck.mockResolvedValue(true);

    const app = createSandboxApp(sandboxService);
    const response = await request(app).get('/api/sandbox/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'healthy',
      },
    });
    expect(sandboxService.healthCheck).toHaveBeenCalledTimes(1);
  });

  it('does not start HTTP, gRPC, dotenv, or signal handlers on module import', () => {
    jest.resetModules();

    const { createServer } = require('http') as typeof import('http');
    const createServerSpy = jest.spyOn({ createServer }, 'createServer');
    const config = jest.fn();
    const bindAsync = jest.fn();
    const grpcServerCtor = jest.fn(() => ({
      bindAsync,
      addService: jest.fn(),
      start: jest.fn(),
      tryShutdown: jest.fn(),
      forceShutdown: jest.fn(),
    }));
    const loadSync = jest.fn();

    const initialSigintListeners = process.listenerCount('SIGINT');
    const initialSigtermListeners = process.listenerCount('SIGTERM');

    jest.doMock('dotenv', () => ({ config }));
    jest.doMock('@grpc/proto-loader', () => ({ loadSync }));
    jest.doMock('@grpc/grpc-js', () => ({
      Server: grpcServerCtor,
      loadPackageDefinition: jest.fn(() => ({ judge: { SandboxService: { service: {} } } })),
      ServerCredentials: { createInsecure: jest.fn(() => ({})) },
      status: { INTERNAL: 13 },
    }));

    jest.isolateModules(() => {
      require('../../../apps/sandbox/src/sandbox.server');
    });

    expect(config).not.toHaveBeenCalled();
    expect(createServerSpy).not.toHaveBeenCalled();
    expect(grpcServerCtor).not.toHaveBeenCalled();
    expect(bindAsync).not.toHaveBeenCalled();
    expect(loadSync).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners);

    createServerSpy.mockRestore();
  });
});

