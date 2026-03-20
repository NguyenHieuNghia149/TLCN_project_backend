import request from 'supertest';

describe('api server bootstrap factories', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('does not trigger startup side effects on module import', () => {
    const config = jest.fn();
    const connect = jest.fn();
    const runMigrations = jest.fn();
    const queueConnect = jest.fn();
    const getJudgeQueueService = jest.fn(() => ({ connect: queueConnect }));
    const initializeWebSocket = jest.fn();
    const examAutoSubmitService = { start: jest.fn() };
    const initializeWatchdogCron = jest.fn();
    const createAdminRouter = jest.fn();
    const registerRoutes = jest.fn();
    const createServer = jest.fn();

    const initialSigintListeners = process.listenerCount('SIGINT');
    const initialSigtermListeners = process.listenerCount('SIGTERM');

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('dotenv', () => ({ config }));
    jest.doMock('http', () => ({ ...jest.requireActual('http'), createServer }));
    jest.doMock('@backend/shared/db/connection', () => ({
      DatabaseService: { connect, runMigrations },
    }));
    jest.doMock('@backend/shared/runtime/judge-queue', () => ({ getJudgeQueueService }));
    jest.doMock('../../../apps/api/src/routes', () => ({ registerRoutes }));
    jest.doMock('../../../apps/api/src/routes/admin', () => ({ createAdminRouter }));
    jest.doMock('../../../apps/api/src/cron/watchdog', () => ({ initializeWatchdogCron }));
    jest.doMock('../../../apps/api/src/services/exam-auto-submit.service', () => ({
      examAutoSubmitService,
    }));
    jest.doMock('../../../apps/api/src/services/websocket.service', () => ({
      initializeWebSocket,
    }));

    jest.isolateModules(() => {
      require('../../../apps/api/src/index');
    });

    expect(config).not.toHaveBeenCalled();
    expect(createServer).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
    expect(getJudgeQueueService).not.toHaveBeenCalled();
    expect(queueConnect).not.toHaveBeenCalled();
    expect(initializeWebSocket).not.toHaveBeenCalled();
    expect(examAutoSubmitService.start).not.toHaveBeenCalled();
    expect(initializeWatchdogCron).not.toHaveBeenCalled();
    expect(createAdminRouter).not.toHaveBeenCalled();
    expect(registerRoutes).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners);
  });

  it('creates an express app without touching the admin queue router', async () => {
    const registerRoutes = jest.fn();
    const createAdminRouter = jest.fn();

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('../../../apps/api/src/routes', () => ({ registerRoutes }));
    jest.doMock('../../../apps/api/src/routes/admin', () => ({ createAdminRouter }));

    let createApiApp!: typeof import('../../../apps/api/src/index').createApiApp;
    jest.isolateModules(() => {
      ({ createApiApp } = require('../../../apps/api/src/index'));
    });

    const app = createApiApp();
    const response = await request(app).get('/api/unknown');

    expect(registerRoutes).toHaveBeenCalledTimes(1);
    expect(createAdminRouter).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'API endpoint not found',
      code: 'NOT_FOUND',
    });
  });

  it('starts the API server with the expected startup order', async () => {
    const calls: string[] = [];
    const config = jest.fn();
    const connect = jest.fn(async () => {
      calls.push('connect');
    });
    const runMigrations = jest.fn(async () => {
      calls.push('migrate');
    });
    const queueConnect = jest.fn(() => {
      calls.push('queue');
      return Promise.resolve();
    });
    const getJudgeQueueService = jest.fn(() => ({ connect: queueConnect }));
    const initializeWebSocket = jest.fn(() => {
      calls.push('websocket');
    });
    const examAutoSubmitService = {
      start: jest.fn(async () => {
        calls.push('exam');
      }),
    };
    const initializeWatchdogCron = jest.fn(() => {
      calls.push('watchdog');
    });
    const adminRouter = ((req: unknown, res: unknown, next: () => void) => next()) as any;
    const createAdminRouter = jest.fn(() => {
      calls.push('admin');
      return adminRouter;
    });
    const registerRoutes = jest.fn(() => {
      calls.push('routes');
    });
    const server: {
      once: jest.Mock;
      off: jest.Mock;
      listen: jest.Mock;
    } = {} as any;
    server.once = jest.fn(() => server);
    server.off = jest.fn(() => server);
    server.listen = jest.fn((port: unknown, callback: () => void) => {
      calls.push('listen');
      callback();
      return server;
    });
    const createServer = jest.fn(() => server);

    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('dotenv', () => ({ config }));
    jest.doMock('http', () => ({ ...jest.requireActual('http'), createServer }));
    jest.doMock('@backend/shared/db/connection', () => ({
      DatabaseService: { connect, runMigrations },
    }));
    jest.doMock('@backend/shared/runtime/judge-queue', () => ({ getJudgeQueueService }));
    jest.doMock('../../../apps/api/src/routes', () => ({ registerRoutes }));
    jest.doMock('../../../apps/api/src/routes/admin', () => ({ createAdminRouter }));
    jest.doMock('../../../apps/api/src/cron/watchdog', () => ({ initializeWatchdogCron }));
    jest.doMock('../../../apps/api/src/services/exam-auto-submit.service', () => ({
      examAutoSubmitService,
    }));
    jest.doMock('../../../apps/api/src/services/websocket.service', () => ({
      initializeWebSocket,
    }));

    let startApiServer!: typeof import('../../../apps/api/src/index').startApiServer;
    jest.isolateModules(() => {
      ({ startApiServer } = require('../../../apps/api/src/index'));
    });

    const started = await startApiServer();

    expect(started.server).toBe(server);
    expect(registerRoutes).toHaveBeenCalledTimes(1);
    expect(createServer).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(initializeWebSocket).toHaveBeenCalledTimes(1);
    expect(examAutoSubmitService.start).toHaveBeenCalledTimes(1);
    expect(getJudgeQueueService).toHaveBeenCalledTimes(1);
    expect(queueConnect).toHaveBeenCalledTimes(1);
    expect(initializeWatchdogCron).toHaveBeenCalledTimes(1);
    expect(createAdminRouter).toHaveBeenCalledTimes(1);
    expect(server.listen).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'routes',
      'connect',
      'migrate',
      'websocket',
      'exam',
      'queue',
      'watchdog',
      'admin',
      'listen',
    ]);
  });
});
