import { logger } from '@backend/shared/utils';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

/** Minimal interface for submission event subscriptions used by the controller. */
export interface ISubmissionEventStream {
  on(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
  removeListener(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
}

interface IRedisSubscriber {
  subscribe(channel: string, callback: (err: unknown, count: unknown) => void): unknown;
  on(event: 'message', listener: (channel: string, message: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  quit(): Promise<unknown>;
}

type SseServiceDependencies = {
  subscriber: IRedisSubscriber;
};

class SseService extends EventEmitter implements ISubmissionEventStream {
  private readonly subscriber: IRedisSubscriber;

  constructor({ subscriber }: SseServiceDependencies) {
    super();
    this.subscriber = subscriber;

    this.subscriber.subscribe('submission_updates', ((err: unknown, count: unknown) => {
      if (err) {
        logger.error('[SSE] Failed to subscribe to submission_updates', err);
      } else {
        logger.info(`[SSE] Subscribed to submission_updates. Total channels: ${count}`);
      }
    }) as (err: unknown, count: unknown) => void);

    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel === 'submission_updates') {
        try {
          const payload = JSON.parse(message);
          if (payload && payload.submissionId && payload.data) {
            this.emit(`submission_${payload.submissionId}`, payload.data);
          }
        } catch (error) {
          logger.error('[SSE] Error parsing Redis Pub/Sub message', error);
        }
      }
    });

    this.subscriber.on('error', (err: Error) => {
      logger.error('[SSE] Redis subscriber error:', err.message);
    });
  }

  public async disconnect(): Promise<void> {
    await this.subscriber.quit();
  }
}

let sseService: SseService | null = null;

/** Creates a submission event stream backed by a Redis subscriber built from env configuration. */
export function createSseService(): ISubmissionEventStream {
  const redisUrl =
    process.env.REDIS_CACHE_URL || process.env.REDIS_URL || 'redis://localhost:6379/0';
  const subscriber = new Redis(redisUrl) as unknown as IRedisSubscriber;

  return new SseService({ subscriber });
}

/** Returns the cached SSE service and initializes the Redis subscriber on first use. */
export function getSseService(): ISubmissionEventStream {
  if (!sseService) {
    sseService = createSseService() as SseService;
  }

  return sseService;
}

/** Disconnects the Redis subscriber and clears the cached SSE instance for tests. */
export async function resetSseServiceForTesting(): Promise<void> {
  if (!sseService) {
    return;
  }

  await sseService.disconnect();
  sseService = null;
}