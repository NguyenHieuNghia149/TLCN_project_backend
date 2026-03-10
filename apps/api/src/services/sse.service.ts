import { logger } from '@backend/shared/utils';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

class SseService extends EventEmitter {
  private subscriber: Redis;

  constructor() {
    super();
    // Use DB 0 for Caching/SSE PubSub constraint
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
          // Assuming payload is { submissionId: string, data: any }
          if (payload && payload.submissionId && payload.data) {
            this.emit(`submission_${payload.submissionId}`, payload.data);
          }
        } catch (e) {
          logger.error('[SSE] Error parsing Redis Pub/Sub message', e);
        }
      }
    });

    this.subscriber.on('error', (err: Error) => {
      logger.error('[SSE] Redis subscriber error:', err.message);
    });
  }

  // Graceful shutdown
  public async disconnect() {
    await this.subscriber.quit();
  }
}

export const sseService = new SseService();
