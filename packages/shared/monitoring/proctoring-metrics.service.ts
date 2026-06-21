export type ProctoringMetricsSnapshot = {
  finalFlushPollDurationMs: number[];
  finalFlushSuccessTotal: number;
  finalFlushTimeoutTotal: number;
  finalFlushFailedTotal: number;
  summaryRequestedTotal: number;
  summaryAcceptedTotal: number;
  summaryValidationFailedTotal: number;
  summaryProviderFailedTotal: number;
  summaryDeadLetterTotal: number;
  summaryRegeneratedTotal: number;
  summaryRateLimitedTotal: number;
  wsTelemetryAcceptedTotal: number;
  wsTelemetryRejectedTotal: number;
  redisAppendLatencyMs: number[];
  telemetryPersisterBatchSizes: number[];
  telemetryPersisterBatchDurationsMs: number[];
  finalFlushWaitDurationsMs: number[];
  aiJobPendingTotal: number;
  aiJobRetryTotal: number;
  aiJobDeadLetterTotal: number;
  llmSummaryJobPendingTotal: number;
  llmSummaryJobRetryTotal: number;
  llmSummaryJobDeadLetterTotal: number;
  serverAiLatencyMs: number[];
  serverAiFailureTotal: number;
};

export class ProctoringMetricsService {
  private pollDurationsMs: number[] = [];
  private successTotal = 0;
  private timeoutTotal = 0;
  private failedTotal = 0;
  private maxPollSamples = 1000;
  private summaryRequested = 0;
  private summaryAccepted = 0;
  private summaryValidationFailed = 0;
  private summaryProviderFailed = 0;
  private summaryDeadLetter = 0;
  private summaryRegenerated = 0;
  private summaryRateLimited = 0;

  private wsAccepted = 0;
  private wsRejected = 0;
  private redisAppendLatenciesMs: number[] = [];
  private persisterBatchSizes: number[] = [];
  private persisterBatchDurationsMs: number[] = [];
  private finalFlushWaitDurationsMs: number[] = [];
  private aiPending = 0;
  private aiRetry = 0;
  private aiDeadLetter = 0;
  private llmPending = 0;
  private llmRetry = 0;
  private llmDeadLetter = 0;
  private serverAiLatenciesMs: number[] = [];
  private serverAiFailure = 0;

  recordFinalFlushPollDuration(durationMs: number): void {
    this.pollDurationsMs.push(durationMs);
    if (this.pollDurationsMs.length > this.maxPollSamples) {
      this.pollDurationsMs.shift();
    }
  }

  incrementFinalFlushSuccess(): void {
    this.successTotal += 1;
  }

  incrementFinalFlushTimeout(): void {
    this.timeoutTotal += 1;
  }

  incrementFinalFlushFailed(): void {
    this.failedTotal += 1;
  }

  incrementSummaryRequested(): void { this.summaryRequested += 1; }
  incrementSummaryAccepted(): void { this.summaryAccepted += 1; }
  incrementSummaryValidationFailed(): void { this.summaryValidationFailed += 1; }
  incrementSummaryProviderFailed(): void { this.summaryProviderFailed += 1; }
  incrementSummaryDeadLetter(): void { this.summaryDeadLetter += 1; }
  incrementSummaryRegenerated(): void { this.summaryRegenerated += 1; }
  incrementSummaryRateLimited(): void { this.summaryRateLimited += 1; }

  incrementWsTelemetryAccepted(): void { this.wsAccepted += 1; }
  incrementWsTelemetryRejected(): void { this.wsRejected += 1; }

  recordRedisAppendLatency(durationMs: number): void {
    this.redisAppendLatenciesMs.push(durationMs);
    if (this.redisAppendLatenciesMs.length > this.maxPollSamples) {
      this.redisAppendLatenciesMs.shift();
    }
  }

  recordTelemetryPersisterBatch(batchSize: number, durationMs: number): void {
    this.persisterBatchSizes.push(batchSize);
    this.persisterBatchDurationsMs.push(durationMs);
    if (this.persisterBatchSizes.length > this.maxPollSamples) {
      this.persisterBatchSizes.shift();
      this.persisterBatchDurationsMs.shift();
    }
  }

  recordFinalFlushWaitDuration(durationMs: number): void {
    this.finalFlushWaitDurationsMs.push(durationMs);
    if (this.finalFlushWaitDurationsMs.length > this.maxPollSamples) {
      this.finalFlushWaitDurationsMs.shift();
    }
  }

  incrementAiJobPending(): void { this.aiPending += 1; }
  incrementAiJobRetry(): void { this.aiRetry += 1; }
  incrementAiJobDeadLetter(): void { this.aiDeadLetter += 1; }

  incrementLlmSummaryJobPending(): void { this.llmPending += 1; }
  incrementLlmSummaryJobRetry(): void { this.llmRetry += 1; }
  incrementLlmSummaryJobDeadLetter(): void { this.llmDeadLetter += 1; }

  recordServerAiLatency(durationMs: number): void {
    this.serverAiLatenciesMs.push(durationMs);
    if (this.serverAiLatenciesMs.length > this.maxPollSamples) {
      this.serverAiLatenciesMs.shift();
    }
  }

  incrementServerAiFailure(): void { this.serverAiFailure += 1; }

  snapshot(): ProctoringMetricsSnapshot {
    return {
      finalFlushPollDurationMs: [...this.pollDurationsMs],
      finalFlushSuccessTotal: this.successTotal,
      finalFlushTimeoutTotal: this.timeoutTotal,
      finalFlushFailedTotal: this.failedTotal,
      summaryRequestedTotal: this.summaryRequested,
      summaryAcceptedTotal: this.summaryAccepted,
      summaryValidationFailedTotal: this.summaryValidationFailed,
      summaryProviderFailedTotal: this.summaryProviderFailed,
      summaryDeadLetterTotal: this.summaryDeadLetter,
      summaryRegeneratedTotal: this.summaryRegenerated,
      summaryRateLimitedTotal: this.summaryRateLimited,
      wsTelemetryAcceptedTotal: this.wsAccepted,
      wsTelemetryRejectedTotal: this.wsRejected,
      redisAppendLatencyMs: [...this.redisAppendLatenciesMs],
      telemetryPersisterBatchSizes: [...this.persisterBatchSizes],
      telemetryPersisterBatchDurationsMs: [...this.persisterBatchDurationsMs],
      finalFlushWaitDurationsMs: [...this.finalFlushWaitDurationsMs],
      aiJobPendingTotal: this.aiPending,
      aiJobRetryTotal: this.aiRetry,
      aiJobDeadLetterTotal: this.aiDeadLetter,
      llmSummaryJobPendingTotal: this.llmPending,
      llmSummaryJobRetryTotal: this.llmRetry,
      llmSummaryJobDeadLetterTotal: this.llmDeadLetter,
      serverAiLatencyMs: [...this.serverAiLatenciesMs],
      serverAiFailureTotal: this.serverAiFailure,
    };
  }

  pollDurationSummary(): { count: number; min: number; max: number; avg: number } | null {
    if (this.pollDurationsMs.length === 0) return null;
    const sum = this.pollDurationsMs.reduce((a, b) => a + b, 0);
    return {
      count: this.pollDurationsMs.length,
      min: Math.min(...this.pollDurationsMs),
      max: Math.max(...this.pollDurationsMs),
      avg: Math.round(sum / this.pollDurationsMs.length),
    };
  }

  reset(): void {
    this.pollDurationsMs = [];
    this.successTotal = 0;
    this.timeoutTotal = 0;
    this.failedTotal = 0;
    this.summaryRequested = 0;
    this.summaryAccepted = 0;
    this.summaryValidationFailed = 0;
    this.summaryProviderFailed = 0;
    this.summaryDeadLetter = 0;
    this.summaryRegenerated = 0;
    this.summaryRateLimited = 0;
    this.wsAccepted = 0;
    this.wsRejected = 0;
    this.redisAppendLatenciesMs = [];
    this.persisterBatchSizes = [];
    this.persisterBatchDurationsMs = [];
    this.finalFlushWaitDurationsMs = [];
    this.aiPending = 0;
    this.aiRetry = 0;
    this.aiDeadLetter = 0;
    this.llmPending = 0;
    this.llmRetry = 0;
    this.llmDeadLetter = 0;
    this.serverAiLatenciesMs = [];
    this.serverAiFailure = 0;
  }
}

export function createProctoringMetricsService(): ProctoringMetricsService {
  return new ProctoringMetricsService();
}
