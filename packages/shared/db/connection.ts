// src/database/connection.ts
import { logger } from '@backend/shared/utils';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import path from 'path';
import * as schema from './schema';

// Load .env using absolute path (works regardless of cwd when running from workspace)
// In Docker, process.env is already populated by docker-compose — dotenv won't override.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

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
  connectionTimeoutMillis: 100000, // Increased from 2s to 100s
  keepAlive: true, // Keep connection alive
  keepAliveInitialDelayMillis: 10000, // Delay before starting keep-alive
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export the correct transaction type
export type DatabaseType = typeof db;
export type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Database connection utilities

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
      // Check if pool is still active
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
      // Check if pool is still alive
      if (pool.totalCount === 0 && pool.idleCount === 0 && pool.waitingCount > 0) {
        logger.error('Pool is in an invalid state');
        return;
      }

      // Use absolute path for migrations in production
      const migrationsFolder =
        process.env.NODE_ENV === 'production'
          ? '/app/dist/src/database/migrations'
          : './src/database/migrations';

      logger.info(`Running migrations from: ${migrationsFolder}`);

      // Ensure meta folder exists
      const metaDir = `${migrationsFolder}/meta`;
      const metaFile = `${metaDir}/_journal.json`;
      const fs = require('fs');
      if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
      }
      if (!fs.existsSync(metaFile)) {
        fs.writeFileSync(metaFile, JSON.stringify({ version: '5', entries: [] }));
      }

      // Use the existing db instance with the pool for migrations
      await migrate(db, { migrationsFolder });
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Database migration failed:', error);
      // Log more details about the error
      if (error instanceof Error) {
        logger.error('Error details:', error.message);
        logger.error('Stack:', error.stack);
      }
      // Don't throw error to allow app to continue running
      // The app should still work even if migrations fail
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

// Handle process termination gracefully
let isDisconnecting = false;

process.on('SIGINT', async () => {
  if (isDisconnecting) return;
  isDisconnecting = true;
  logger.info('\nShutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isDisconnecting) return;
  isDisconnecting = true;
  logger.info('\nShutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});
