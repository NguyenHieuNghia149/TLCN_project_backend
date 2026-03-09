import { createClient, RedisClientType } from 'redis';
import { config } from 'dotenv';
import { BaseException } from '@/exceptions/auth.exceptions';

config();

export interface QueueJob {
  submissionId: string;
  userId: string;
  problemId: string;
  code: string;
  language: string;
  testcases: Array<{
    id: string;
    input: string;
    output: string;
    point: number;
    isPublic?: boolean;
  }>;
  timeLimit: number;
  memoryLimit: string;
  createdAt: string;
  jobType?: 'SUBMISSION' | 'RUN_CODE';
}

export class QueueService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL,
    });

    this.client.on('error', err => {
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.isConnected = false;
    } catch (error) {
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      throw error;
    }
  }

  async addJob(job: QueueJob): Promise<void> {
    if (!this.isConnected) {
      throw new BaseException('Redis client is not connected', 500, 'REDIS_NOT_CONNECTED');
    }

    try {
      await this.client.lPush('judge_queue', JSON.stringify(job));
    } catch (error) {
      throw error;
    }
  }

  async getJob(): Promise<QueueJob | null> {
    if (!this.isConnected) {
      throw new BaseException('Redis client is not connected', 500, 'REDIS_NOT_CONNECTED');
    }

    try {
      const result = await this.client.brPop('judge_queue', 5); // Wait up to 5 seconds
      if (result) {
        return JSON.parse(result.element) as QueueJob;
      }
      return null;
    } catch (error) {
      throw error;
    }
  }

  async getQueueLength(): Promise<number> {
    if (!this.isConnected) {
      throw new BaseException('Redis client is not connected', 500, 'REDIS_NOT_CONNECTED');
    }

    try {
      return await this.client.lLen('judge_queue');
    } catch (error) {
      throw error;
    }
  }

  async clearQueue(): Promise<void> {
    if (!this.isConnected) {
      throw new BaseException('Redis client is not connected', 500, 'REDIS_NOT_CONNECTED');
    }

    try {
      await this.client.del('judge_queue');
    } catch (error) {
      throw error;
    }
  }

  async getQueueStatus(): Promise<{
    length: number;
    isHealthy: boolean;
  }> {
    try {
      const length = await this.getQueueLength();
      const isHealthy = await this.isHealthy();

      return {
        length,
        isHealthy,
      };
    } catch (error) {
      return {
        length: 0,
        isHealthy: false,
      };
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.isConnected) {
      // Try to connect if not connected
      try {
        await this.connect();
      } catch (e) {
        throw e;
        return;
      }
    }
    try {
      await this.client.publish(channel, message);
    } catch (error) {
      throw error;
    }
  }
}

// Singleton instance
export const queueService = new QueueService();
