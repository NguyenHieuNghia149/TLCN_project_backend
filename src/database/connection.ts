// src/database/connection.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { config } from 'dotenv';

config();

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
  connectionTimeoutMillis: 100000, // Tăng từ 2s lên 100s
  keepAlive: true, // Giữ kết nối sống
  keepAliveInitialDelayMillis: 10000, // Delay trước khi bắt đầu keep-alive
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export the correct transaction type
export type DatabaseType = typeof db;
export type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Database connection utilities

pool.on('error', error => {
  console.error('Database connection pool error:', error);
});

export class DatabaseService {
  static async connect(): Promise<void> {
    try {
      const client = await pool.connect();
      console.log('Database connected successfully');
      client.release();
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    try {
      // Check if pool is still active
      if (pool.totalCount > 0 || pool.idleCount > 0) {
        await pool.end();
        console.log('Database disconnected successfully');
      }
    } catch (error) {
      console.error('Database disconnection failed:', error);
      throw error;
    }
  }

  static async runMigrations(): Promise<void> {
    try {
      // Check if pool is still alive
      if (pool.totalCount === 0 && pool.idleCount === 0 && pool.waitingCount > 0) {
        console.error('Pool is in an invalid state');
        return;
      }

      // Use absolute path for migrations in production
      const migrationsFolder =
        process.env.NODE_ENV === 'production'
          ? '/app/dist/src/database/migrations'
          : './src/database/migrations';

      console.log(`Running migrations from: ${migrationsFolder}`);

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
      console.log('Database migrations completed');
    } catch (error) {
      console.error('Database migration failed:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack:', error.stack);
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
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

// Handle process termination gracefully
let isDisconnecting = false;

process.on('SIGINT', async () => {
  if (isDisconnecting) return;
  isDisconnecting = true;
  console.log('\nShutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isDisconnecting) return;
  isDisconnecting = true;
  console.log('\nShutting down gracefully...');
  await DatabaseService.disconnect();
  process.exit(0);
});
