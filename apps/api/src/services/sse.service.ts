import { logger } from '@backend/shared/utils';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

/** Minimal interface for submission event subscriptions used by the controller. */
export interface ISubmissionEventStream {
  on(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
  removeListener(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
}

class SseService extends EventEmitter {
  private subscriber: Redis;

  constructor() {
    super();
    // Use DB 0 for caching/SSE PubSub constraint.
    const redisUrl =
      process.env.REDIS_CACHE_URL || process.env.REDIS_URL || 'redis://localhost:6379/0';
    this.subscriber = new Redis(redisUrl);

    this.subscriber.subscribe('submission_updates', ((err: any, count: any) => {
      if (err) {
        logger.error('[SSE] Failed to subscribe to submission_updates', err);
      } else {
        logger.info(`[SSE] Subscribed to submission_updates. Total channels: ${count}`);
      }
    }) as any);

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

/** Returns the cached SSE service and initializes the Redis subscriber on first use. */
export function getSseService(): ISubmissionEventStream {
  if (!sseService) {
    sseService = new SseService();
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
