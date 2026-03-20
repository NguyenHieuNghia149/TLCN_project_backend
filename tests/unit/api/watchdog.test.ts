describe('watchdog cron wiring', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('requeues orphaned submissions when queue jobs are missing', async () => {
    const schedule = jest.fn();
    let scheduledTask: (() => void) | undefined;
    schedule.mockImplementation((expression: string, task: () => void) => {
      scheduledTask = task;
      return {} as any;
    });

    const where = jest.fn(async () => [{ id: 'submission-1' }]);
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    const getJobById = jest.fn(async () => null);
    const requeuePendingSubmission = jest.fn(async () => true);

    jest.doMock('@backend/shared/db/connection', () => ({
      db: { select },
    }));
    jest.doMock('@backend/shared/db/schema', () => ({
      submissions: { id: 'id', status: 'status', submittedAt: 'submittedAt' },
    }));
    jest.doMock('@backend/shared/runtime/judge-queue', () => ({
      getJudgeQueueService: jest.fn(() => ({ getJobById })),
    }));
    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
    jest.doMock('drizzle-orm', () => ({
      and: jest.fn(() => 'and'),
      eq: jest.fn(() => 'eq'),
      lt: jest.fn(() => 'lt'),
    }));
    jest.doMock('node-cron', () => ({
      __esModule: true,
      default: { schedule },
    }));

    let initializeWatchdogCron!: typeof import('../../../apps/api/src/cron/watchdog').initializeWatchdogCron;
    jest.isolateModules(() => {
      ({ initializeWatchdogCron } = require('../../../apps/api/src/cron/watchdog'));
    });

    initializeWatchdogCron({ requeuePendingSubmission });
    expect(schedule).toHaveBeenCalledTimes(1);

    scheduledTask?.();
    await new Promise(resolve => setImmediate(resolve));

    expect(getJobById).toHaveBeenCalledWith('submission-1');
    expect(requeuePendingSubmission).toHaveBeenCalledWith('submission-1');
  });

  it('does not schedule duplicate watchdog jobs when initialized twice', () => {
    const schedule = jest.fn();

    jest.doMock('@backend/shared/db/connection', () => ({
      db: { select: jest.fn() },
    }));
    jest.doMock('@backend/shared/db/schema', () => ({
      submissions: { id: 'id', status: 'status', submittedAt: 'submittedAt' },
    }));
    jest.doMock('@backend/shared/runtime/judge-queue', () => ({
      getJudgeQueueService: jest.fn(() => ({ getJobById: jest.fn() })),
    }));
    jest.doMock('@backend/shared/utils', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
    jest.doMock('drizzle-orm', () => ({
      and: jest.fn(() => 'and'),
      eq: jest.fn(() => 'eq'),
      lt: jest.fn(() => 'lt'),
    }));
    jest.doMock('node-cron', () => ({
      __esModule: true,
      default: { schedule },
    }));

    let initializeWatchdogCron!: typeof import('../../../apps/api/src/cron/watchdog').initializeWatchdogCron;
    jest.isolateModules(() => {
      ({ initializeWatchdogCron } = require('../../../apps/api/src/cron/watchdog'));
    });

    const recoveryService = { requeuePendingSubmission: jest.fn(async () => false) };
    initializeWatchdogCron(recoveryService);
    initializeWatchdogCron(recoveryService);

    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
