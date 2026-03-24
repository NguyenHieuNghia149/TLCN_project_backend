import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { logger } from '@backend/shared/utils/logger';

import * as schema from './schema';

export interface DatabaseConfig {
  host?: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  ssl: false | { rejectUnauthorized: false };
  min: number;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  keepAlive: boolean;
  keepAliveInitialDelayMillis: number;
}

export type DatabaseType = ReturnType<typeof createDatabaseClient>;
export type TransactionType = Parameters<Parameters<DatabaseType['transaction']>[0]>[0];

export type DatabaseServiceInstance = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  runMigrations(): Promise<void>;
  healthCheck(): Promise<boolean>;
};

const DATABASE_PROCESS_HANDLERS_REGISTERED = Symbol.for('backend.db.processHandlersRegistered');
const DATABASE_PROCESS_DISCONNECTING = Symbol.for('backend.db.processDisconnecting');

const globalState = globalThis as typeof globalThis & {
  [DATABASE_PROCESS_HANDLERS_REGISTERED]?: boolean;
  [DATABASE_PROCESS_DISCONNECTING]?: boolean;
};

let databasePoolInstance: Pool | null = null;
let databaseClientInstance: DatabaseType | null = null;
let databaseServiceInstance: DatabaseServiceInstance | null = null;

/** Loads environment variables lazily without triggering module-scope bootstrap. */
function ensureDatabaseEnvLoaded(): void {
  require('../utils/load-env');
}

/** Parses an integer environment variable with a fallback value. */
function parseIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Resolves the default migrations folder for the current runtime. */
function resolveDefaultMigrationsFolder(): string {
  ensureDatabaseEnvLoaded();

  return process.env.NODE_ENV === 'production'
    ? '/app/packages/shared/db/migrations'
    : './packages/shared/db/migrations';
}

/** Clears cached pool and client singletons after shutdown. */
function resetDatabaseSingletons(): void {
  databaseClientInstance = null;
  databasePoolInstance = null;
}

/** Returns true when the config targets a hosted Supabase pooler while SSL is disabled. */
function hasHostedPoolerSslMismatch(config: DatabaseConfig): boolean {
  return Boolean(config.host?.endsWith('.pooler.supabase.com')) && config.ssl === false;
}

/** Builds a sanitized error payload for pool-level connection failures without leaking client internals. */
function serializeDatabasePoolError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const metadata: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  const errorWithCode = error as Error & { code?: string };
  if (typeof errorWithCode.code === 'string' && errorWithCode.code.length > 0) {
    metadata.code = errorWithCode.code;
  }

  return metadata;
}

/** Reads database config from the current process environment. */
export function readDatabaseConfigFromEnv(): DatabaseConfig {
  ensureDatabaseEnvLoaded();

  return {
    host: process.env.DB_HOST,
    port: parseIntegerEnv(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    min: parseIntegerEnv(process.env.DB_POOL_MIN, 2),
    max: parseIntegerEnv(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: 300000,
    connectionTimeoutMillis: 100000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };
}

/** Creates a fresh PostgreSQL pool from explicit or environment-backed config. */
export function createDatabasePool(config?: DatabaseConfig): Pool {
  const resolvedConfig = config ?? readDatabaseConfigFromEnv();

  if (hasHostedPoolerSslMismatch(resolvedConfig)) {
    logger.warn(
      'Database SSL is disabled while using a Supabase pooler host. This can cause unexpected disconnects; set DB_SSL=true for this environment.',
    );
  }

  const pool = new Pool(resolvedConfig);

  pool.on('error', error => {
    logger.error('Database connection pool error:', serializeDatabasePoolError(error));
  });

  return pool;
}

/** Creates a fresh Drizzle client from a PostgreSQL pool. */
export function createDatabaseClient(pool: Pool) {
  return drizzle(pool, { schema });
}

/** Returns the shared pool singleton, creating it on first access. */
export function getDatabasePool(): Pool {
  if (!databasePoolInstance) {
    databasePoolInstance = createDatabasePool();
  }

  return databasePoolInstance;
}

/** Returns the shared Drizzle client singleton, creating it on first access. */
export function getDb(): DatabaseType {
  if (!databaseClientInstance) {
    databaseClientInstance = createDatabaseClient(getDatabasePool());
  }

  return databaseClientInstance;
}

/** Creates a database service with optional injected dependencies for testing and composition. */
export function createDatabaseService(deps: {
  pool?: Pool;
  db?: DatabaseType;
  migrationsFolderResolver?: () => string;
} = {}): DatabaseServiceInstance {
  let servicePool = deps.pool ?? null;
  let serviceDb = deps.db ?? null;

  const resolvePool = (): Pool => {
    if (!servicePool) {
      servicePool = getDatabasePool();
    }

    return servicePool;
  };

  const resolveDb = (): DatabaseType => {
    if (!serviceDb) {
      serviceDb = servicePool ? createDatabaseClient(resolvePool()) : getDb();
    }

    return serviceDb;
  };

  const resolveMigrationsFolder = deps.migrationsFolderResolver ?? resolveDefaultMigrationsFolder;

  return {
    async connect(): Promise<void> {
      try {
        const client = await resolvePool().connect();
        logger.info('Database connected successfully');
        client.release();
      } catch (error) {
        logger.error('Database connection failed:', error);
        throw error;
      }
    },

    async disconnect(): Promise<void> {
      const pool = resolvePool();

      try {
        if (pool.totalCount > 0 || pool.idleCount > 0) {
          await pool.end();
          logger.info('Database disconnected successfully');
        }
      } catch (error) {
        logger.error('Database disconnection failed:', error);
        throw error;
      } finally {
        if (pool === databasePoolInstance) {
          resetDatabaseSingletons();
        }
      }
    },

    async runMigrations(): Promise<void> {
      const pool = resolvePool();
      const db = resolveDb();

      try {
        if (pool.totalCount === 0 && pool.idleCount === 0 && pool.waitingCount > 0) {
          logger.error('Pool is in an invalid state');
          return;
        }

        const migrationsFolder = resolveMigrationsFolder();
        logger.info(`Running migrations from: ${migrationsFolder}`);

        const metaDir = path.join(migrationsFolder, 'meta');
        const metaFile = path.join(metaDir, '_journal.json');
        if (!fs.existsSync(metaDir)) {
          fs.mkdirSync(metaDir, { recursive: true });
        }
        if (!fs.existsSync(metaFile)) {
          fs.writeFileSync(metaFile, JSON.stringify({ version: '5', entries: [] }));
        }

        await migrate(db, { migrationsFolder });
        logger.info('Database migrations completed');
      } catch (error) {
        logger.error('Database migration failed:', error);
        if (error instanceof Error) {
          logger.error('Error details:', error.message);
          logger.error('Stack:', error.stack);
        }
      }
    },

    async healthCheck(): Promise<boolean> {
      try {
        const result = await resolveDb().execute(sql`SELECT 1 as health`);

        if (Array.isArray(result)) {
          return result.length > 0;
        }

        return Array.isArray(result.rows) && result.rows.length > 0;
      } catch (error) {
        logger.error('Database health check failed:', error);
        return false;
      }
    },
  };
}

function getDatabaseService(): DatabaseServiceInstance {
  if (!databaseServiceInstance) {
    databaseServiceInstance = createDatabaseService();
  }

  return databaseServiceInstance;
}

/** Registers SIGINT/SIGTERM handlers that gracefully disconnect the database service once. */
export function registerDatabaseProcessHandlers(deps: {
  databaseService?: Pick<typeof DatabaseService, 'disconnect'>;
  exit?: (code: number) => void;
} = {}): void {
  if (globalState[DATABASE_PROCESS_HANDLERS_REGISTERED]) {
    return;
  }

  globalState[DATABASE_PROCESS_HANDLERS_REGISTERED] = true;
  const databaseService = deps.databaseService ?? DatabaseService;
  const exit = deps.exit ?? process.exit;

  const shutdown = async (): Promise<void> => {
    if (globalState[DATABASE_PROCESS_DISCONNECTING]) {
      return;
    }

    globalState[DATABASE_PROCESS_DISCONNECTING] = true;
    logger.info('\nShutting down gracefully...');

    try {
      await databaseService.disconnect();
    } finally {
      exit(0);
    }
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });
}

export const db = new Proxy({} as DatabaseType, {
  get(_target, property) {
    const targetDb = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(targetDb, property, targetDb);

    if (typeof value === 'function') {
      return value.bind(targetDb);
    }

    return value;
  },
  set(_target, property, value) {
    const targetDb = getDb() as unknown as Record<PropertyKey, unknown>;
    return Reflect.set(targetDb, property, value, targetDb);
  },
  has(_target, property) {
    return Reflect.has(getDb() as object, property);
  },
  ownKeys() {
    return Reflect.ownKeys(getDb() as object);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(getDb() as object, property);
  },
}) as DatabaseType;

export class DatabaseService {
  static connect(): Promise<void> {
    return getDatabaseService().connect();
  }

  static disconnect(): Promise<void> {
    return getDatabaseService().disconnect();
  }

  static runMigrations(): Promise<void> {
    return getDatabaseService().runMigrations();
  }

  static healthCheck(): Promise<boolean> {
    return getDatabaseService().healthCheck();
  }
}

