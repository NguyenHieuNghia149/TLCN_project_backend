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
      await pool.end();
      console.log('Database disconnected successfully');
    } catch (error) {
      console.error('Database disconnection failed:', error);
      throw error;
    }
  }

  static async runMigrations(): Promise<void> {
    try {
      await migrate(db, { migrationsFolder: './src/database/migrations' });
      console.log('Database migrations completed');
    } catch (error) {
      console.error('Database migration failed:', error);
      throw error;
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

// Handle process termination
process.on('SIGINT', async () => {
  await DatabaseService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await DatabaseService.disconnect();
  process.exit(0);
});
