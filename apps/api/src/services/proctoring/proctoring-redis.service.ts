import Redis from 'ioredis';

import { logger } from '@backend/shared/utils';

export const PROCTORING_SESSION_KEY_PREFIX = 'proctoring:session:';
export const PROCTORING_DEADLINE_KEY_PREFIX = 'proctoring:deadline:';
export const PROCTORING_TELEMETRY_STREAM_PREFIX = 'proctoring:telemetry:stream';
export const PROCTORING_TELEMETRY_DEAD_LETTER_STREAM = 'proctoring:telemetry:dead-letter';
export const PROCTORING_TELEMETRY_CONSUMER_GROUP = 'proctoring-telemetry-persisters';

export type ProctoringRedisClient = {
  on(event: 'error', listener: (error: Error) => void): unknown;
  ping(): Promise<string>;
  hset(key: string, values: Record<string, string>): Promise<number>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<string | null>;
  del(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  xadd(key: string, id: string, ...args: string[]): Promise<string>;
  quit(): Promise<unknown>;
};

export type ProctoringSessionStateInput = {
  participationId: string;
  sessionId: string;
  clientSessionId: string;
  status: string;
  lastSeenAt: Date;
  lastAcceptedClientSeq?: number;
  lastPersistedClientSeq?: number;
  activeDeadlineType?: string | null;
  activeDeadlineAt?: Date | null;
};

export type ProctoringDeadline = {
  participationId: string;
  deadlineType: string;
  deadlineAt: Date;
};

export type ProctoringTelemetryAppendInput = {
  shard?: number | string;
  event: Record<string, unknown>;
};

type ProctoringRedisServiceDependencies = {
  createClient?: () => ProctoringRedisClient;
};

const sensitivePayloadKeys = new Set([
  'rawmedia',
  'media',
  'imagedata',
  'videodata',
  'audiodata',
  'clipboardtext',
  'rawclipboardtext',
  'keystrokes',
  'keystrokecontent',
  'keycontent',
  'sourcecode',
  'code',
]);

export function getProctoringRedisUrl(): string {
  return (
    process.env.PROCTORING_REDIS_URL ||
    process.env.REDIS_CACHE_URL ||
    process.env.REDIS_URL ||
    'redis://localhost:6379/0'
  );
}

export function getProctoringSessionKey(participationId: string): string {
  return `${PROCTORING_SESSION_KEY_PREFIX}${participationId}`;
}

export function getProctoringDeadlineKey(participationId: string): string {
  return `${PROCTORING_DEADLINE_KEY_PREFIX}${participationId}`;
}

export function getProctoringTelemetryStreamKey(shard: number | string = 0): string {
  return `${PROCTORING_TELEMETRY_STREAM_PREFIX}:${shard}`;
}

function sanitizeTelemetryValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeTelemetryValue(item));
  }
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [key, nestedValue]) => {
      if (sensitivePayloadKeys.has(key.toLowerCase())) {
        return acc;
      }
      acc[key] = sanitizeTelemetryValue(nestedValue);
      return acc;
    },
    {},
  );
}

export function sanitizeTelemetryPayload(payload: unknown): Record<string, unknown> {
  const sanitized = sanitizeTelemetryValue(payload);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return {};
  }
  return sanitized as Record<string, unknown>;
}

export class ProctoringRedisService {
  private client: ProctoringRedisClient | null = null;

  constructor(private readonly deps: ProctoringRedisServiceDependencies = {}) {}

  async connect(): Promise<void> {
    const client = await this.getClient();
    await client.ping();
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.quit();
    this.client = null;
  }

  async getClient(): Promise<ProctoringRedisClient> {
    if (!this.client) {
      this.client =
        this.deps.createClient?.() ??
        (new Redis(getProctoringRedisUrl(), {
          maxRetriesPerRequest: null,
        }) as unknown as ProctoringRedisClient);
      this.client.on('error', error => {
        logger.error('[ProctoringRedisService] Redis error:', error.message);
      });
    }

    return this.client;
  }

  async upsertSessionState(input: ProctoringSessionStateInput): Promise<void> {
    const values: Record<string, string> = {
      participationId: input.participationId,
      sessionId: input.sessionId,
      clientSessionId: input.clientSessionId,
      status: input.status,
      lastSeenAt: input.lastSeenAt.toISOString(),
    };

    if (input.lastAcceptedClientSeq !== undefined) {
      values.lastAcceptedClientSeq = String(input.lastAcceptedClientSeq);
    }
    if (input.lastPersistedClientSeq !== undefined) {
      values.lastPersistedClientSeq = String(input.lastPersistedClientSeq);
    }
    if (input.activeDeadlineType) {
      values.activeDeadlineType = input.activeDeadlineType;
    }
    if (input.activeDeadlineAt) {
      values.activeDeadlineAt = input.activeDeadlineAt.toISOString();
    }

    const client = await this.getClient();
    await client.hset(getProctoringSessionKey(input.participationId), values);
  }

  async setDeadline(input: ProctoringDeadline & { now?: Date }): Promise<void> {
    const now = input.now ?? new Date();
    const ttlMs = Math.max(1, input.deadlineAt.getTime() - now.getTime());
    const client = await this.getClient();
    await client.set(
      getProctoringDeadlineKey(input.participationId),
      JSON.stringify({
        participationId: input.participationId,
        deadlineType: input.deadlineType,
        deadlineAt: input.deadlineAt.toISOString(),
      }),
      'PX',
      ttlMs,
    );
  }

  async getDeadline(participationId: string): Promise<ProctoringDeadline | null> {
    const client = await this.getClient();
    const raw = await client.get(getProctoringDeadlineKey(participationId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      participationId: string;
      deadlineType: string;
      deadlineAt: string;
    };

    return {
      participationId: parsed.participationId,
      deadlineType: parsed.deadlineType,
      deadlineAt: new Date(parsed.deadlineAt),
    };
  }

  async clearDeadline(participationId: string): Promise<void> {
    const client = await this.getClient();
    await client.del(getProctoringDeadlineKey(participationId));
  }

  async appendTelemetryEvent(input: ProctoringTelemetryAppendInput): Promise<{
    streamKey: string;
    redisId: string;
  }> {
    const client = await this.getClient();
    const streamKey = getProctoringTelemetryStreamKey(input.shard ?? 0);
    const event = {
      ...input.event,
      payloadJson: sanitizeTelemetryPayload(input.event.payloadJson),
    };
    const redisId = await client.xadd(streamKey, '*', 'event', JSON.stringify(event));

    return { streamKey, redisId };
  }
}

export function createProctoringRedisService(): ProctoringRedisService {
  return new ProctoringRedisService();
}
