import { logger } from '@backend/shared/utils';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import path from 'path';
import { BaseException } from '../exceptions/auth.exceptions';

require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

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
  public queue: Queue;
  private publisher: Redis;

  constructor() {
    // 1. Dedicated Redis for BullMQ Queue (e.g. DB 1)
    const queueRedisUrl =
      process.env.REDIS_QUEUE_URL || process.env.REDIS_URL || 'redis://localhost:6379/1';
    const queueConnection = new Redis(queueRedisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue('judge_queue', { connection: queueConnection as any });

    // 2. Dedicated Redis for Cache/PubSub (e.g. DB 0)
    const pubsubRedisUrl =
      process.env.REDIS_CACHE_URL || process.env.REDIS_URL || 'redis://localhost:6379/0';
    this.publisher = new Redis(pubsubRedisUrl);

    this.publisher.on('error', (err: Error) => {
      logger.error('[QueueService Publisher] Redis error:', err.message);
    });
  }

  async connect(): Promise<void> {
    // ioredis connects automatically
  }

  async disconnect(): Promise<void> {
    await this.queue.close();
    await this.publisher.quit();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.publisher.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  async addJob(job: QueueJob): Promise<void> {
    try {
      // Delegate to BullMQ
      await this.queue.add(job.jobType || 'SUBMISSION', job, {
        jobId: job.submissionId, // Helps with debugging and deduplication
        removeOnComplete: true, // Prevent RAM Bloat (Task 2.2)
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });
    } catch (error: any) {
      throw new BaseException(`Failed to queue job: ${error.message}`, 500, 'QUEUE_ERROR');
    }
  }

  // Deprecated for Worker (Worker Service will use BullMQ Worker natively)
  async getJob(): Promise<QueueJob | null> {
    return null;
  }

  async getQueueLength(): Promise<number> {
    try {
      return await this.queue.count();
    } catch (error) {
      return 0;
    }
  }

  async clearQueue(): Promise<void> {
    try {
      await this.queue.obliterate({ force: true });
    } catch (error) {
      throw error;
    }
  }

  async getQueueStatus(): Promise<{ length: number; isHealthy: boolean }> {
    try {
      const length = await this.getQueueLength();
      const isHealthy = await this.isHealthy();
      return { length, isHealthy };
    } catch (error) {
      return { length: 0, isHealthy: false };
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.publisher.publish(channel, message);
    } catch (error) {
      logger.error(`[QueueService] Failed to publish message: ${error}`);
    }
  }
}

// Singleton instance
export const queueService = new QueueService();
