// src/database/utils.ts
import { db, TransactionType } from './connection';
import { sql } from 'drizzle-orm';

export class DatabaseUtils {
  // Fixed transaction wrapper with correct type
  static async withTransaction<T>(
    callback: (tx: TransactionType) => Promise<T>
  ): Promise<T> {
    return await db.transaction(callback);
  }

  // Health check with detailed info
  static async getHealthInfo() {
    try {
      const dbTime = await db.execute(sql`SELECT NOW() as current_time`);
      const dbVersion = await db.execute(sql`SELECT version() as version`);

      return {
        status: 'healthy',
        timestamp: (dbTime.rows[0] as any).current_time,
        version: (dbVersion.rows[0] as any).version,
        connected: true,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false,
      };
    }
  }

  // Get connection pool status
  static getPoolStatus() {
    // Access the internal pool through the db instance
    const dbInternal = db as any;
    const pool = dbInternal.$client;
    
    if (!pool) return null;

    return {
      totalConnections: pool.totalCount || 0,
      idleConnections: pool.idleCount || 0,
      waitingClients: pool.waitingCount || 0,
    };
  }

  // Check if database is accessible
  static async isConnected(): Promise<boolean> {
    try {
      await db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  // Execute raw SQL with proper error handling
  static async executeRaw<T = any>(query: string, params: any[] = []): Promise<T[]> {
    try {
      const result = await db.execute(sql.raw(query));
      return result.rows as T[];
    } catch (error) {
      console.error('Raw SQL execution failed:', error);
      throw error;
    }
  }

  // Get database statistics
  static async getDatabaseStats() {
    try {
      const tableStatsResult = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `);

      const connectionStatsResult = await db.execute(sql`
        SELECT 
          count(*) as total_connections,
          count(*) filter (where state = 'active') as active_connections,
          count(*) filter (where state = 'idle') as idle_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      return {
        tableStats: tableStatsResult.rows,
        connectionStats: connectionStatsResult.rows[0],
      };
    } catch (error: any) {
      console.error('Failed to get database stats:', error);
      return {
        error: error.message,
      };
    }
  }
}