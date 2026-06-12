export type ProctoringMetricsSnapshot = {
  finalFlushPollDurationMs: number[];
  finalFlushSuccessTotal: number;
  finalFlushTimeoutTotal: number;
  finalFlushFailedTotal: number;
};

export class ProctoringMetricsService {
  private pollDurationsMs: number[] = [];
  private successTotal = 0;
  private timeoutTotal = 0;
  private failedTotal = 0;
  private maxPollSamples = 1000;

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

  snapshot(): ProctoringMetricsSnapshot {
    return {
      finalFlushPollDurationMs: [...this.pollDurationsMs],
      finalFlushSuccessTotal: this.successTotal,
      finalFlushTimeoutTotal: this.timeoutTotal,
      finalFlushFailedTotal: this.failedTotal,
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
  }
}

export function createProctoringMetricsService(): ProctoringMetricsService {
  return new ProctoringMetricsService();
}
