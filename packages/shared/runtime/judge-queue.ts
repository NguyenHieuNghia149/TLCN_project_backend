import '../utils/load-env';

import { logger } from '../utils';
import { FunctionSignature } from '../types';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export interface QueueJobTestcase {
  id: string;
  point: number;
  isPublic?: boolean;
  inputJson: Record<string, unknown>;
  outputJson: unknown;
}

export interface QueueJob {
  submissionId: string;
  userId: string;
  problemId: string;
  code: string;
  language: string;
  functionSignature: FunctionSignature;
  testcases: QueueJobTestcase[];
  timeLimit: number;
  memoryLimit: string;
  createdAt: string;
  jobType?: 'SUBMISSION' | 'RUN_CODE';
}

export class JudgeQueueError extends Error {
  readonly code = 'QUEUE_ERROR';
  readonly statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = 'JudgeQueueError';
  }
}

export class JudgeQueueService {
  public queue: Queue;
  private publisher: Redis;

  constructor() {
    const queueRedisUrl =
      process.env.REDIS_QUEUE_URL || process.env.REDIS_URL || 'redis://localhost:6379/1';
    const queueConnection = new Redis(queueRedisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue('judge_queue', { connection: queueConnection as any });

    const pubsubRedisUrl =
      process.env.REDIS_CACHE_URL || process.env.REDIS_URL || 'redis://localhost:6379/0';
    this.publisher = new Redis(pubsubRedisUrl);

    this.publisher.on('error', (err: Error) => {
      logger.error('[JudgeQueueService Publisher] Redis error:', err.message);
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
    } catch {
      return false;
    }
  }

  async addJob(job: QueueJob): Promise<void> {
    try {
      await this.queue.add(job.jobType || 'SUBMISSION', job, {
        jobId: job.submissionId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });
    } catch (error: any) {
      throw new JudgeQueueError(`Failed to queue job: ${error.message}`);
    }
  }

  async getJob(): Promise<QueueJob | null> {
    return null;
  }

  async getQueueLength(): Promise<number> {
    try {
      return await this.queue.count();
    } catch {
      return 0;
    }
  }

  async clearQueue(): Promise<void> {
    await this.queue.obliterate({ force: true });
  }

  async getQueueStatus(): Promise<{ length: number; isHealthy: boolean }> {
    try {
      const length = await this.getQueueLength();
      const isHealthy = await this.isHealthy();
      return { length, isHealthy };
    } catch {
      return { length: 0, isHealthy: false };
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    try {
      await this.publisher.publish(channel, message);
    } catch (error) {
      logger.error(`[JudgeQueueService] Failed to publish message: ${error}`);
    }
  }
}

export const judgeQueueService = new JudgeQueueService();
