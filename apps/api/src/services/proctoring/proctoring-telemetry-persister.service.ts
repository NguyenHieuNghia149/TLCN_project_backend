import os from 'os';

import { ProctoringEventRepository } from '@backend/api/repositories/proctoring/proctoringEvent.repository';
import { ProctoringFinalFlushRepository } from '@backend/api/repositories/proctoring/proctoringFinalFlush.repository';
import { ExamProctoringEventInsert } from '@backend/shared/db/schema';
import { logger } from '@backend/shared/utils';

import {
  createProctoringRedisService,
  getProctoringTelemetryStreamKey,
  PROCTORING_TELEMETRY_CONSUMER_GROUP,
  PROCTORING_TELEMETRY_DEAD_LETTER_STREAM,
  ProctoringRedisService,
  sanitizeTelemetryPayload,
} from './proctoring-redis.service';
import {
  createProctoringSummaryService,
  ProctoringSummaryService,
} from './proctoring-summary.service';
import { createProctoringAiJobService, ProctoringAiJobService } from './proctoring-ai-job.service';

type RedisStreamEntry = [string, string[]];
type RedisReadResponse = Array<[string, RedisStreamEntry[]]> | null;
type RedisAutoClaimResponse = [string, RedisStreamEntry[], string[]?];

type ProctoringStreamRedisClient = {
  xgroup(...args: string[]): Promise<unknown>;
  xreadgroup(...args: Array<string | number>): Promise<RedisReadResponse>;
  xautoclaim(...args: Array<string | number>): Promise<RedisAutoClaimResponse>;
  xack(streamKey: string, group: string, ...ids: string[]): Promise<number>;
  xadd(streamKey: string, id: string, ...args: string[]): Promise<string>;
};

type ProctoringTelemetryPersisterDependencies = {
  redis?: ProctoringStreamRedisClient;
  redisService?: Pick<ProctoringRedisService, 'getClient'>;
  eventRepository?: Pick<ProctoringEventRepository, 'bulkInsertDedupe'>;
  finalFlushRepository?: Pick<ProctoringFinalFlushRepository, 'transitionStatus'>;
  summaryService?: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
  aiJobService?: Pick<
    ProctoringAiJobService,
    'enqueueTelemetryWindow' | 'enqueueFinalSubmitWindow'
  >;
  streamShard?: number | string;
  groupName?: string;
  consumerName?: string;
  batchSize?: number;
  blockMs?: number;
  minIdleMs?: number;
  pollIntervalMs?: number;
  afterDurableWriteBeforeAck?: () => Promise<void> | void;
};

type ParsedTelemetryEntry = {
  streamId: string;
  raw: string;
  insert: ExamProctoringEventInsert;
  finalFlushReceiptId: string | null;
};

export type ProctoringTelemetryPersisterResult = {
  processedCount: number;
  insertedCount: number;
  dedupedCount: number;
  deadLetterCount: number;
};

function defaultConsumerName(): string {
  return `api-${process.pid}-${os.hostname()}`;
}

function emptyResult(): ProctoringTelemetryPersisterResult {
  return {
    processedCount: 0,
    insertedCount: 0,
    dedupedCount: 0,
    deadLetterCount: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function decodeFields(fields: string[]): Record<string, string> {
  const decoded: Record<string, string> = {};
  for (let index = 0; index < fields.length; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];
    if (key && value !== undefined) {
      decoded[key] = value;
    }
  }
  return decoded;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid telemetry event: ${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid telemetry event: ${field} must be a finite number`);
  }
  return value;
}

function requireDate(value: unknown, field: string): Date {
  const raw = requireString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid telemetry event: ${field} must be an ISO timestamp`);
  }
  return date;
}

function parseTelemetryEntry(entry: RedisStreamEntry): ParsedTelemetryEntry {
  const [streamId, fields] = entry;
  const decoded = decodeFields(fields);
  const raw = decoded.event;
  if (!raw) {
    throw new Error('Invalid telemetry event: event field is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid telemetry event JSON: ${(error as Error).message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('Invalid telemetry event: event must be an object');
  }

  const insert: ExamProctoringEventInsert = {
    id: optionalString(parsed.id) ?? undefined,
    examId: requireString(parsed.examId, 'examId'),
    participationId: requireString(parsed.participationId, 'participationId'),
    sessionId: requireString(parsed.sessionId, 'sessionId'),
    entrySessionId: optionalString(parsed.entrySessionId),
    candidateUserId: requireString(parsed.candidateUserId, 'candidateUserId'),
    clientSessionId: requireString(parsed.clientSessionId, 'clientSessionId'),
    clientSeq: requireNumber(parsed.clientSeq, 'clientSeq'),
    type: requireString(parsed.type, 'type'),
    severity: requireString(parsed.severity, 'severity'),
    schemaVersion: requireNumber(parsed.schemaVersion, 'schemaVersion'),
    payloadJson: sanitizeTelemetryPayload(parsed.payloadJson),
    capturedAt: requireDate(parsed.capturedAt, 'capturedAt'),
    receivedAt: requireDate(parsed.receivedAt, 'receivedAt'),
    buffered: true,
    finalFlushReceiptId: optionalString(parsed.finalFlushReceiptId),
  };

  return {
    streamId,
    raw,
    insert,
    finalFlushReceiptId: insert.finalFlushReceiptId ?? null,
  };
}

function flattenReadResponse(response: RedisReadResponse): RedisStreamEntry[] {
  if (!response) {
    return [];
  }

  return response.flatMap(([, entries]) => entries);
}

export class ProctoringTelemetryPersisterService {
  private readonly redisService: Pick<ProctoringRedisService, 'getClient'>;
  private readonly eventRepository: Pick<ProctoringEventRepository, 'bulkInsertDedupe'>;
  private readonly finalFlushRepository: Pick<ProctoringFinalFlushRepository, 'transitionStatus'>;
  private readonly summaryService: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
  private readonly aiJobService: Pick<
    ProctoringAiJobService,
    'enqueueTelemetryWindow' | 'enqueueFinalSubmitWindow'
  >;
  private readonly streamKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly batchSize: number;
  private readonly blockMs: number;
  private readonly minIdleMs: number;
  private readonly pollIntervalMs: number;
  private readonly afterDurableWriteBeforeAck?: () => Promise<void> | void;
  private redis: ProctoringStreamRedisClient | null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(deps: ProctoringTelemetryPersisterDependencies = {}) {
    this.redis = deps.redis ?? null;
    this.redisService = deps.redisService ?? createProctoringRedisService();
    this.eventRepository = deps.eventRepository ?? new ProctoringEventRepository();
    this.finalFlushRepository = deps.finalFlushRepository ?? new ProctoringFinalFlushRepository();
    this.summaryService = deps.summaryService ?? createProctoringSummaryService();
    this.aiJobService = deps.aiJobService ?? createProctoringAiJobService();
    this.streamKey = getProctoringTelemetryStreamKey(deps.streamShard ?? 0);
    this.groupName = deps.groupName ?? PROCTORING_TELEMETRY_CONSUMER_GROUP;
    this.consumerName = deps.consumerName ?? defaultConsumerName();
    this.batchSize = deps.batchSize ?? 100;
    this.blockMs = deps.blockMs ?? 2000;
    this.minIdleMs = deps.minIdleMs ?? 30000;
    this.pollIntervalMs = deps.pollIntervalMs ?? 1000;
    this.afterDurableWriteBeforeAck = deps.afterDurableWriteBeforeAck;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await this.bootstrapConsumerGroup();
    this.running = true;
    this.timer = setInterval(() => {
      void this.runOnceSafely();
    }, this.pollIntervalMs);
    this.timer.unref?.();
    void this.runOnceSafely();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async bootstrapConsumerGroup(): Promise<void> {
    const redis = await this.getRedis();
    try {
      await redis.xgroup('CREATE', this.streamKey, this.groupName, '0', 'MKSTREAM');
    } catch (error) {
      if ((error as Error).message.includes('BUSYGROUP')) {
        return;
      }
      throw error;
    }
  }

  async processBatchOnce(): Promise<ProctoringTelemetryPersisterResult> {
    const redis = await this.getRedis();
    const response = await redis.xreadgroup(
      'GROUP',
      this.groupName,
      this.consumerName,
      'COUNT',
      this.batchSize,
      'BLOCK',
      this.blockMs,
      'STREAMS',
      this.streamKey,
      '>'
    );

    return this.processEntries(flattenReadResponse(response));
  }

  async recoverPendingOnce(): Promise<ProctoringTelemetryPersisterResult> {
    const redis = await this.getRedis();
    const response = await redis.xautoclaim(
      this.streamKey,
      this.groupName,
      this.consumerName,
      this.minIdleMs,
      '0-0',
      'COUNT',
      this.batchSize
    );

    return this.processEntries(response[1] ?? []);
  }

  private async runOnceSafely(): Promise<void> {
    try {
      await this.recoverPendingOnce();
      await this.processBatchOnce();
    } catch (error) {
      logger.error('[ProctoringTelemetryPersister] Batch failed:', (error as Error).message);
    }
  }

  private async getRedis(): Promise<ProctoringStreamRedisClient> {
    if (!this.redis) {
      this.redis = (await this.redisService.getClient()) as unknown as ProctoringStreamRedisClient;
    }
    return this.redis;
  }

  private async processEntries(
    entries: RedisStreamEntry[]
  ): Promise<ProctoringTelemetryPersisterResult> {
    if (entries.length === 0) {
      return emptyResult();
    }

    const redis = await this.getRedis();
    const result = emptyResult();
    const validEntries: ParsedTelemetryEntry[] = [];

    for (const entry of entries) {
      try {
        validEntries.push(parseTelemetryEntry(entry));
      } catch (error) {
        result.deadLetterCount += 1;
        await this.deadLetterMalformedEntry(entry, error as Error);
        await redis.xack(this.streamKey, this.groupName, entry[0]);
      }
    }

    if (validEntries.length === 0) {
      return result;
    }

    const finalFlushReceiptIds = Array.from(
      new Set(validEntries.map(entry => entry.finalFlushReceiptId).filter(Boolean))
    ) as string[];

    for (const receiptId of finalFlushReceiptIds) {
      await this.finalFlushRepository.transitionStatus({
        receiptId,
        fromStatuses: ['received', 'persisting'],
        toStatus: 'persisting',
      });
    }

    let bulkResult: { insertedCount: number; dedupedCount: number };

    try {
      bulkResult = await this.eventRepository.bulkInsertDedupe(
        validEntries.map(entry => entry.insert)
      );
    } catch (error) {
      logger.warn(
        '[ProctoringTelemetryPersister] bulkInsertDedupe failed, will retry:',
        (error as Error).message,
      );
      return result;
    }

    result.processedCount += validEntries.length;
    result.insertedCount += bulkResult.insertedCount;
    result.dedupedCount += bulkResult.dedupedCount;

    for (const receiptId of finalFlushReceiptIds) {
      const acceptedCount = validEntries.filter(
        entry => entry.finalFlushReceiptId === receiptId
      ).length;
      await this.finalFlushRepository.transitionStatus({
        receiptId,
        fromStatuses: ['received', 'persisting'],
        toStatus: 'persisted',
        persistedAt: new Date(),
        counts: {
          acceptedCount,
          dedupedCount: bulkResult.dedupedCount,
          persistedCount: bulkResult.insertedCount,
        },
      });
    }

    await this.recomputeSummaries(validEntries);
    await this.enqueueAiJobs(validEntries);

    await this.afterDurableWriteBeforeAck?.();
    await redis.xack(this.streamKey, this.groupName, ...validEntries.map(entry => entry.streamId));

    return result;
  }

  private async deadLetterMalformedEntry(entry: RedisStreamEntry, error: Error): Promise<void> {
    const redis = await this.getRedis();
    const fields = decodeFields(entry[1]);
    await redis.xadd(
      PROCTORING_TELEMETRY_DEAD_LETTER_STREAM,
      '*',
      'sourceStream',
      this.streamKey,
      'sourceId',
      entry[0],
      'error',
      error.message,
      'raw',
      fields.event ?? JSON.stringify(fields)
    );
  }

  private async recomputeSummaries(entries: ParsedTelemetryEntry[]): Promise<void> {
    const groupedByParticipation = new Map<string, ParsedTelemetryEntry[]>();
    for (const entry of entries) {
      const group = groupedByParticipation.get(entry.insert.participationId) ?? [];
      group.push(entry);
      groupedByParticipation.set(entry.insert.participationId, group);
    }

    for (const group of groupedByParticipation.values()) {
      const first = group[0]!;
      await this.summaryService.recomputeForParticipation({
        participationId: first.insert.participationId,
        finalFlushStatus: group.some(entry => entry.finalFlushReceiptId) ? 'persisted' : null,
      });
    }
  }

  private async enqueueAiJobs(entries: ParsedTelemetryEntry[]): Promise<void> {
    const groupedByParticipation = new Map<string, ParsedTelemetryEntry[]>();
    for (const entry of entries) {
      const group = groupedByParticipation.get(entry.insert.participationId) ?? [];
      group.push(entry);
      groupedByParticipation.set(entry.insert.participationId, group);
    }

    for (const group of groupedByParticipation.values()) {
      try {
        const events = group.map(entry => entry.insert as any);
        await this.aiJobService.enqueueTelemetryWindow({ events });
        const finalFlushEntry = group.find(entry => entry.finalFlushReceiptId);
        if (finalFlushEntry?.finalFlushReceiptId) {
          const submitAttemptId =
            typeof finalFlushEntry.insert.payloadJson.submitAttemptId === 'string'
              ? finalFlushEntry.insert.payloadJson.submitAttemptId
              : finalFlushEntry.finalFlushReceiptId;
          await this.aiJobService.enqueueFinalSubmitWindow({ events, submitAttemptId });
        }
      } catch (error) {
        logger.warn(
          '[ProctoringTelemetryPersister] AI job enqueue failed:',
          (error as Error).message
        );
      }
    }
  }
}

export function createProctoringTelemetryPersisterService(): ProctoringTelemetryPersisterService {
  return new ProctoringTelemetryPersisterService({
    redisService: createProctoringRedisService(),
    eventRepository: new ProctoringEventRepository(),
    finalFlushRepository: new ProctoringFinalFlushRepository(),
    summaryService: createProctoringSummaryService(),
    aiJobService: createProctoringAiJobService(),
  });
}
