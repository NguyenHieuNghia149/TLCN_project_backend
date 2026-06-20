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
  }
}

export function createProctoringMetricsService(): ProctoringMetricsService {
  return new ProctoringMetricsService();
}
