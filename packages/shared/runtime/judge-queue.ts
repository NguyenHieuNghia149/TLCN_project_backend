import '../utils/load-env';

import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { FunctionSignature } from '../types';
import { logger } from '../utils';

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

interface IJudgeQueuePublisher {
  on(event: 'error', listener: (err: Error) => void): this;
  ping(): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
}

type JudgeQueueServiceDependencies = {
  createQueue: () => Queue;
  createPublisher: () => IJudgeQueuePublisher;
};

export class JudgeQueueService {
  private readonly createQueue: () => Queue;
  private readonly createPublisher: () => IJudgeQueuePublisher;
  private queue?: Queue;
  private publisher?: IJudgeQueuePublisher;
  private initialized = false;

  constructor({ createQueue, createPublisher }: JudgeQueueServiceDependencies) {
    this.createQueue = createQueue;
    this.createPublisher = createPublisher;
  }

  private initializeIfNeeded(): void {
    if (this.initialized) {
      return;
    }

    this.queue = this.createQueue();
    this.publisher = this.createPublisher();

    this.publisher.on('error', (err: Error) => {
      logger.error('[JudgeQueueService Publisher] Redis error:', err.message);
    });

    this.initialized = true;
  }

  async connect(): Promise<void> {
    this.initializeIfNeeded();
  }

  async disconnect(): Promise<void> {
    const queue = this.queue;
    const publisher = this.publisher;

    this.queue = undefined;
    this.publisher = undefined;
    this.initialized = false;

    if (queue) {
      await queue.close();
    }

    if (publisher) {
      try {
        await publisher.quit();
      } catch {
        publisher.disconnect();
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.initializeIfNeeded();
      await this.publisher!.ping();
      return true;
    } catch {
      return false;
    }
  }

  async addJob(job: QueueJob): Promise<Job> {
    try {
      this.initializeIfNeeded();
      return await this.queue!.add(job.jobType || 'SUBMISSION', job, {
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

  async getJobById(id: string): Promise<Job | null> {
    try {
      this.initializeIfNeeded();
      const job = await this.queue!.getJob(id);
      return job ?? null;
    } catch {
      return null;
    }
  }

  async getQueueLength(): Promise<number> {
    try {
      this.initializeIfNeeded();
      return await this.queue!.count();
    } catch {
      return 0;
    }
  }

  async clearQueue(): Promise<void> {
    this.initializeIfNeeded();
    await this.queue!.obliterate({ force: true });
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
      this.initializeIfNeeded();
      await this.publisher!.publish(channel, message);
    } catch (error) {
      logger.error(`[JudgeQueueService] Failed to publish message: ${error}`);
    }
  }

  getQueue(): Queue {
    this.initializeIfNeeded();
    return this.queue!;
  }
}

let judgeQueueServiceInstance: JudgeQueueService | null = null;

/** Creates a fresh JudgeQueueService backed by the current Redis env configuration. */
export function createJudgeQueueService(): JudgeQueueService {
  const queueRedisUrl =
    process.env.REDIS_QUEUE_URL || process.env.REDIS_URL || 'redis://localhost:6379/1';
  const pubsubRedisUrl =
    process.env.REDIS_CACHE_URL || process.env.REDIS_URL || 'redis://localhost:6379/0';

  return new JudgeQueueService({
    createQueue: () => {
      const queueConnection = new Redis(queueRedisUrl, {
        maxRetriesPerRequest: null,
      });

      return new Queue('judge_queue', { connection: queueConnection as any });
    },
    createPublisher: () => new Redis(pubsubRedisUrl) as unknown as IJudgeQueuePublisher,
  });
}

export function getJudgeQueueService(): JudgeQueueService {
  if (!judgeQueueServiceInstance) {
    judgeQueueServiceInstance = createJudgeQueueService();
  }

  return judgeQueueServiceInstance;
}

export async function resetJudgeQueueServiceForTesting(): Promise<void> {
  if (judgeQueueServiceInstance) {
    await judgeQueueServiceInstance.disconnect();
    judgeQueueServiceInstance = null;
  }
}
