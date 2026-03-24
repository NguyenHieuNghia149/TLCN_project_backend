export {};

const PROCESS_HANDLERS_REGISTERED = Symbol.for('backend.db.processHandlersRegistered');
const PROCESS_DISCONNECTING = Symbol.for('backend.db.processDisconnecting');

const originalEnv = { ...process.env };

type ConnectionModule = typeof import('@backend/shared/db/connection');

type MockPoolInstance = {
  config: Record<string, unknown>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  connect: jest.Mock<Promise<{ release: jest.Mock<void, []> }>, []>;
  end: jest.Mock<Promise<void>, []>;
  on: jest.Mock<void, [string, (error: Error) => void]>;
};

type LoadConnectionModuleResult = {
  connectionModule: ConnectionModule;
  logger: {
    info: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
  };
  poolInstances: MockPoolInstance[];
  poolConstructor: jest.Mock;
  drizzleMock: jest.Mock;
  migrateMock: jest.Mock;
  fsMock: {
    existsSync: jest.Mock;
    mkdirSync: jest.Mock;
    writeFileSync: jest.Mock;
  };
};

function resetProcessHandlerState(): void {
  delete (globalThis as Record<PropertyKey, unknown>)[PROCESS_HANDLERS_REGISTERED];
  delete (globalThis as Record<PropertyKey, unknown>)[PROCESS_DISCONNECTING];
}

function applyEnv(overrides: Record<string, string | undefined> = {}): void {
  process.env = { ...originalEnv };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function createPoolInstance(
  overrides: Partial<MockPoolInstance> = {},
  config: Record<string, unknown> = {},
): MockPoolInstance {
  const release = jest.fn<void, []>();

  return {
    config,
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    connect: jest.fn(async () => ({ release })),
    end: jest.fn(async () => undefined),
    on: jest.fn(),
    ...overrides,
  };
}

function createFakeDb(marker = 'db-marker') {
  const fakeDb: Record<string, unknown> = {
    marker,
    query: {
      sample: { marker },
    },
  };

  fakeDb.select = jest.fn(function select(this: { marker: string }) {
    return this.marker;
  });
  fakeDb.insert = jest.fn(function insert(this: { marker: string }) {
    return this.marker;
  });
  fakeDb.update = jest.fn(function update(this: { marker: string }) {
    return this.marker;
  });
  fakeDb.delete = jest.fn(function deleteRow(this: { marker: string }) {
    return this.marker;
  });
  fakeDb.execute = jest.fn(async () => ({ rows: [{ health: 1 }] }));
  fakeDb.transaction = jest.fn(async function transaction<T>(
    this: { marker: string },
    callback: (tx: { marker: string }) => Promise<T> | T,
  ) {
    return callback({ marker: this.marker });
  });

  return fakeDb;
}

function loadConnectionModule(options: {
  env?: Record<string, string | undefined>;
  createDb?: () => Record<string, unknown>;
  createPool?: (config: Record<string, unknown>) => MockPoolInstance;
  fsExistsSync?: (target: unknown) => boolean;
} = {}): LoadConnectionModuleResult {
  jest.resetModules();
  applyEnv(options.env);

  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  const poolInstances: MockPoolInstance[] = [];
  const poolConstructor = jest.fn((config: Record<string, unknown>) => {
    const instance = options.createPool?.(config) ?? createPoolInstance({}, config);
    poolInstances.push(instance);
    return instance;
  });
  const drizzleMock = jest.fn((pool: unknown) => {
    const fakeDb = options.createDb?.() ?? createFakeDb();
    Object.assign(fakeDb, { $client: pool });
    return fakeDb;
  });
  const migrateMock = jest.fn(async () => undefined);
  const fsMock = {
    existsSync: jest.fn(options.fsExistsSync ?? (() => true)),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };

  jest.doMock('@backend/shared/utils/logger', () => ({ logger }));
  jest.doMock('../../../packages/shared/utils/load-env', () => ({}));
  jest.doMock('pg', () => ({ Pool: poolConstructor }));
  jest.doMock('drizzle-orm/node-postgres', () => ({ drizzle: drizzleMock }));
  jest.doMock('drizzle-orm/node-postgres/migrator', () => ({ migrate: migrateMock }));
  jest.doMock('node:fs', () => ({ __esModule: true, default: fsMock }));

  let connectionModule!: ConnectionModule;
  jest.isolateModules(() => {
    connectionModule = require('@backend/shared/db/connection');
  });

  return {
    connectionModule,
    logger,
    poolInstances,
    poolConstructor,
    drizzleMock,
    migrateMock,
    fsMock,
  };
}

async function flushSignalHandlers(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  await Promise.resolve();
}

describe('shared db connection bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    resetProcessHandlerState();
    applyEnv({});
  });

  afterEach(async () => {
    process.emit('SIGTERM');
    process.emit('SIGINT');
    await flushSignalHandlers();
    resetProcessHandlerState();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetProcessHandlerState();
  });

  it('does not construct the pool, create the client, or register signal listeners on module import', () => {
    const initialSigintListeners = process.listenerCount('SIGINT');
    const initialSigtermListeners = process.listenerCount('SIGTERM');

    const { poolConstructor, drizzleMock } = loadConnectionModule();

    expect(poolConstructor).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners);
  });

  it('getDb and getDatabasePool lazily create singletons once', () => {
    const { connectionModule, poolConstructor, drizzleMock } = loadConnectionModule();

    const firstPool = connectionModule.getDatabasePool();
    const secondPool = connectionModule.getDatabasePool();
    const firstDb = connectionModule.getDb();
    const secondDb = connectionModule.getDb();

    expect(firstPool).toBe(secondPool);
    expect(firstDb).toBe(secondDb);
    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(drizzleMock).toHaveBeenCalledTimes(1);
  });

  it('uses a bound lazy proxy for db so detached methods keep the underlying Drizzle instance context', async () => {
    const { connectionModule, poolConstructor, drizzleMock } = loadConnectionModule({
      createDb: () => createFakeDb('proxy-db'),
    });

    expect(poolConstructor).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();

    const detachedSelect = connectionModule.db.select;
    const detachedTransaction = connectionModule.db.transaction as unknown as (
      callback: (tx: { marker: string }) => Promise<string> | string,
    ) => Promise<string>;

    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(drizzleMock).toHaveBeenCalledTimes(1);
    expect(detachedSelect()).toBe('proxy-db');
    await expect(detachedTransaction(async tx => tx.marker)).resolves.toBe('proxy-db');
  });

  it('reads database config from env with the expected defaults', () => {
    const { connectionModule } = loadConnectionModule({
      env: {
        DB_HOST: undefined,
        DB_NAME: undefined,
        DB_USER: undefined,
        DB_PASSWORD: undefined,
        DB_PORT: '6432',
        DB_POOL_MIN: '4',
        DB_POOL_MAX: '12',
        DB_SSL: 'true',
      },
    });

    expect(connectionModule.readDatabaseConfigFromEnv()).toEqual({
      host: undefined,
      port: 6432,
      database: undefined,
      user: undefined,
      password: undefined,
      ssl: { rejectUnauthorized: false },
      min: 4,
      max: 12,
      idleTimeoutMillis: 300000,
      connectionTimeoutMillis: 100000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
  });

  it('createDatabasePool returns a fresh pool each time with the provided config', () => {
    const { connectionModule, poolConstructor, poolInstances } = loadConnectionModule();
    const config = {
      host: 'localhost',
      port: 6543,
      database: 'judge',
      user: 'postgres',
      password: 'secret',
      ssl: false as const,
      min: 1,
      max: 3,
      idleTimeoutMillis: 300000,
      connectionTimeoutMillis: 100000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    const first = connectionModule.createDatabasePool(config);
    const second = connectionModule.createDatabasePool(config);

    expect(first).not.toBe(second);
    expect(poolConstructor).toHaveBeenCalledTimes(2);
    expect(poolInstances[0]?.config).toEqual(config);
    expect(poolInstances[1]?.config).toEqual(config);
  });

  it('createDatabaseService delegates connect, healthCheck, disconnect, and runMigrations using injected deps', async () => {
    const injectedPool = createPoolInstance({ totalCount: 2, idleCount: 1, waitingCount: 0 });
    const injectedDb = {
      execute: jest.fn(async () => ({ rows: [{ health: 1 }] })),
    } as unknown as ReturnType<ConnectionModule['getDb']>;
    const { connectionModule, migrateMock, fsMock } = loadConnectionModule({
      fsExistsSync: (target: unknown) => {
        const normalized = String(target).replace(/\\/g, '/');
        return !(normalized.endsWith('/meta') || normalized.endsWith('/_journal.json'));
      },
    });

    const service = connectionModule.createDatabaseService({
      pool: injectedPool as unknown as import('pg').Pool,
      db: injectedDb,
      migrationsFolderResolver: () => 'D:/migrations',
    });

    await service.connect();
    await expect(service.healthCheck()).resolves.toBe(true);
    await service.runMigrations();
    await service.disconnect();

    expect(injectedPool.connect).toHaveBeenCalledTimes(1);
    expect(injectedDb.execute).toHaveBeenCalledTimes(1);
    expect(fsMock.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('migrations'), { recursive: true });
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('_journal.json'),
      JSON.stringify({ version: '5', entries: [] }),
    );
    expect(migrateMock).toHaveBeenCalledWith(injectedDb, { migrationsFolder: 'D:/migrations' });
    expect(injectedPool.end).toHaveBeenCalledTimes(1);
  });

  it('registerDatabaseProcessHandlers is idempotent across repeated module loads and disconnects on signal', async () => {
    const initialSigintListeners = process.listenerCount('SIGINT');
    const initialSigtermListeners = process.listenerCount('SIGTERM');
    const disconnect = jest.fn(async () => undefined);
    const exit = jest.fn();

    const firstLoad = loadConnectionModule();
    firstLoad.connectionModule.registerDatabaseProcessHandlers({
      databaseService: { disconnect },
      exit,
    });

    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners + 1);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners + 1);

    const secondLoad = loadConnectionModule();
    secondLoad.connectionModule.registerDatabaseProcessHandlers({
      databaseService: { disconnect },
      exit,
    });

    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners + 1);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners + 1);

    process.emit('SIGTERM');
    await flushSignalHandlers();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);

    process.emit('SIGINT');
    await flushSignalHandlers();

    expect(process.listenerCount('SIGINT')).toBe(initialSigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(initialSigtermListeners);
  });
});





