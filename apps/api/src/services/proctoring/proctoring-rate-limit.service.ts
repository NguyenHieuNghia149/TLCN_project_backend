export type ProctoringRateLimitDecision = {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
};

export type ProctoringRateLimitBatchInput = {
  participationId: string;
  clientSessionId: string;
  events: Array<{ clientSeq: number; receivedAt: string; capturedAt: string }>;
  now?: Date;
};

export type ProctoringRateLimitServiceOptions = {
  maxBatchSize?: number;
  staleBufferedEventThresholdMs?: number;
};

export class ProctoringRateLimitService {
  private readonly maxBatchSize: number;
  private readonly staleBufferedEventThresholdMs: number;

  constructor(options: ProctoringRateLimitServiceOptions = {}) {
    this.maxBatchSize = options.maxBatchSize ?? 50;
    this.staleBufferedEventThresholdMs = options.staleBufferedEventThresholdMs ?? 30_000;
  }

  allowBatch(input: ProctoringRateLimitBatchInput): ProctoringRateLimitDecision {
    if (input.events.length > this.maxBatchSize) {
      return {
        allowed: false,
        reason: 'batch_too_large',
      };
    }

    return { allowed: true };
  }

  isStaleBufferedEvent(
    input: { receivedAt: string | Date; capturedAt?: string | Date },
    now: Date = new Date(),
  ): boolean {
    const receivedAt = input.receivedAt instanceof Date ? input.receivedAt : new Date(input.receivedAt);
    return now.getTime() - receivedAt.getTime() > this.staleBufferedEventThresholdMs;
  }
}

export function createProctoringRateLimitService(): ProctoringRateLimitService {
  return new ProctoringRateLimitService();
}
