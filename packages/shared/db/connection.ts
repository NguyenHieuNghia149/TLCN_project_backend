// src/database/connection.ts
import '../utils/load-env';
import { logger } from '@backend/shared/utils';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import path from 'path';
import * as schema from './schema';

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // Connection pool settings
  min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN) : 2,
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 10,
  idleTimeoutMillis: 300000,
  connectionTimeoutMillis: 100000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export the correct transaction type
export type DatabaseType = typeof db;
export type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

pool.on('error', error => {
  logger.error('Database connection pool error:', error);
});

export class DatabaseService {
  static async connect(): Promise<void> {
    try {
      const client = await pool.connect();
      logger.info('Database connected successfully');
      client.release();
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    try {
      if (pool.totalCount > 0 || pool.idleCount > 0) {
        await pool.end();
        logger.info('Database disconnected successfully');
      }
    } catch (error) {
      logger.error('Database disconnection failed:', error);
      throw error;
    }
  }

  static async runMigrations(): Promise<void> {
    try {
      if (pool.totalCount === 0 && pool.idleCount === 0 && pool.waitingCount > 0) {
        logger.error('Pool is in an invalid state');
        return;
      }

      const migrationsFolder =
        process.env.NODE_ENV === 'production'
          ? '/app/packages/shared/db/migrations'
          : './packages/shared/db/migrations';

      logger.info(`Running migrations from: ${migrationsFolder}`);

      const metaDir = `${migrationsFolder}/meta`;
      const metaFile = `${metaDir}/_journal.json`;
      const fs = require('fs');
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
  }

  static async healthCheck(): Promise<boolean> {
    try {
      const result = await db.execute(sql`SELECT 1 as health`);
      return Array.isArray(result) && result.length > 0;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

let isDisconnecting = false;

process.on('SIGINT', async () => {
  if (isDisconnecting) {
    return;
  }
  isDisconnecting = true;
  logger.info('\nShutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isDisconnecting) {
    return;
  }
  isDisconnecting = true;
  logger.info('\nShutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});
