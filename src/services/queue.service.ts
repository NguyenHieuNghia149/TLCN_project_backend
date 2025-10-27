import { createClient, RedisClientType } from 'redis';
import { config } from 'dotenv';

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
  }>;
  timeLimit: number;
  memoryLimit: string;
  createdAt: string;
}

export class QueueService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    this.client.on('error', err => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('Redis disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.isConnected = false;
    } catch (error) {
      console.error('Failed to disconnect from Redis:', error);
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  async addJob(job: QueueJob): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      await this.client.lPush('judge_queue', JSON.stringify(job));
      console.log(`Job added to queue: ${job.submissionId}`);
    } catch (error) {
      console.error('Failed to add job to queue:', error);
      throw error;
    }
  }

  async getJob(): Promise<QueueJob | null> {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const result = await this.client.brPop('judge_queue', 5); // Wait up to 5 seconds
      if (result) {
        return JSON.parse(result.element) as QueueJob;
      }
      return null;
    } catch (error) {
      console.error('Failed to get job from queue:', error);
      throw error;
    }
  }

  async getQueueLength(): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      return await this.client.lLen('judge_queue');
    } catch (error) {
      console.error('Failed to get queue length:', error);
      throw error;
    }
  }

  async clearQueue(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      await this.client.del('judge_queue');
      console.log('Queue cleared');
    } catch (error) {
      console.error('Failed to clear queue:', error);
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
      console.error('Failed to get queue status:', error);
      return {
        length: 0,
        isHealthy: false,
      };
    }
  }
}

// Singleton instance
export const queueService = new QueueService();
