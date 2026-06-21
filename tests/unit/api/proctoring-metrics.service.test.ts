describe('ProctoringMetricsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('records poll durations and success total', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.recordFinalFlushPollDuration(120);
    metrics.recordFinalFlushPollDuration(350);
    metrics.incrementFinalFlushSuccess();

    const snap = metrics.snapshot();
    expect(snap.finalFlushPollDurationMs).toEqual([120, 350]);
    expect(snap.finalFlushSuccessTotal).toBe(1);
    expect(snap.finalFlushTimeoutTotal).toBe(0);
    expect(snap.finalFlushFailedTotal).toBe(0);

    const summary = metrics.pollDurationSummary();
    expect(summary).toEqual({ count: 2, min: 120, max: 350, avg: 235 });
  });

  it('increments timeout and failed totals independently', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.incrementFinalFlushTimeout();
    metrics.incrementFinalFlushTimeout();
    metrics.incrementFinalFlushFailed();

    const snap = metrics.snapshot();
    expect(snap.finalFlushTimeoutTotal).toBe(2);
    expect(snap.finalFlushFailedTotal).toBe(1);
    expect(snap.finalFlushSuccessTotal).toBe(0);
  });

  it('records poll durations bounded by max samples', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();
    const maxSamples = 1000;
    for (let i = 0; i < maxSamples + 50; i++) {
      metrics.recordFinalFlushPollDuration(i);
    }
    expect(metrics.snapshot().finalFlushPollDurationMs.length).toBe(maxSamples);
  });

  it('pollDurationSummary returns null when no samples recorded', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();
    expect(metrics.pollDurationSummary()).toBeNull();
  });

  it('reset clears all counters', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();
    metrics.incrementFinalFlushSuccess();
    metrics.recordFinalFlushPollDuration(100);
    metrics.reset();
    const snap = metrics.snapshot();
    expect(snap.finalFlushSuccessTotal).toBe(0);
    expect(snap.finalFlushPollDurationMs).toEqual([]);
  });

  it('records WebSocket telemetry accepted and rejected counters', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.incrementWsTelemetryAccepted();
    metrics.incrementWsTelemetryAccepted();
    metrics.incrementWsTelemetryRejected();

    const snap = metrics.snapshot();
    expect(snap.wsTelemetryAcceptedTotal).toBe(2);
    expect(snap.wsTelemetryRejectedTotal).toBe(1);
  });

  it('records Redis append latency samples with bounds', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    for (let i = 1; i <= 1500; i++) {
      metrics.recordRedisAppendLatency(i);
    }

    expect(metrics.snapshot().redisAppendLatencyMs.length).toBe(1000);
  });

  it('records telemetry persister batch size and duration', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.recordTelemetryPersisterBatch(50, 120);
    metrics.recordTelemetryPersisterBatch(100, 250);

    const snap = metrics.snapshot();
    expect(snap.telemetryPersisterBatchSizes).toEqual([50, 100]);
    expect(snap.telemetryPersisterBatchDurationsMs).toEqual([120, 250]);
  });

  it('records final flush end-to-end wait durations', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.recordFinalFlushWaitDuration(3200);
    metrics.recordFinalFlushWaitDuration(4800);

    const snap = metrics.snapshot();
    expect(snap.finalFlushWaitDurationsMs).toEqual([3200, 4800]);
  });

  it('records AI job queue pending, retry, and dead-letter counters', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.incrementAiJobPending();
    metrics.incrementAiJobPending();
    metrics.incrementAiJobRetry();
    metrics.incrementAiJobDeadLetter();

    const snap = metrics.snapshot();
    expect(snap.aiJobPendingTotal).toBe(2);
    expect(snap.aiJobRetryTotal).toBe(1);
    expect(snap.aiJobDeadLetterTotal).toBe(1);
  });

  it('records LLM summary job pending, retry, and dead-letter counters', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.incrementLlmSummaryJobPending();
    metrics.incrementLlmSummaryJobPending();
    metrics.incrementLlmSummaryJobPending();
    metrics.incrementLlmSummaryJobRetry();
    metrics.incrementLlmSummaryJobDeadLetter();

    const snap = metrics.snapshot();
    expect(snap.llmSummaryJobPendingTotal).toBe(3);
    expect(snap.llmSummaryJobRetryTotal).toBe(1);
    expect(snap.llmSummaryJobDeadLetterTotal).toBe(1);
  });

  it('records server-ai request latency and failure counter', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.recordServerAiLatency(45);
    metrics.recordServerAiLatency(78);
    metrics.recordServerAiLatency(120);
    metrics.incrementServerAiFailure();

    const snap = metrics.snapshot();
    expect(snap.serverAiLatencyMs).toEqual([45, 78, 120]);
    expect(snap.serverAiFailureTotal).toBe(1);
  });

  it('resets all load metrics counters alongside existing counters', () => {
    const { ProctoringMetricsService } = require('../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.incrementWsTelemetryAccepted();
    metrics.recordRedisAppendLatency(50);
    metrics.recordTelemetryPersisterBatch(10, 100);
    metrics.incrementAiJobDeadLetter();
    metrics.incrementLlmSummaryJobDeadLetter();
    metrics.recordServerAiLatency(80);
    metrics.incrementServerAiFailure();

    metrics.reset();

    const snap = metrics.snapshot();
    expect(snap.wsTelemetryAcceptedTotal).toBe(0);
    expect(snap.wsTelemetryRejectedTotal).toBe(0);
    expect(snap.redisAppendLatencyMs).toEqual([]);
    expect(snap.telemetryPersisterBatchSizes).toEqual([]);
    expect(snap.telemetryPersisterBatchDurationsMs).toEqual([]);
    expect(snap.finalFlushWaitDurationsMs).toEqual([]);
    expect(snap.aiJobPendingTotal).toBe(0);
    expect(snap.aiJobRetryTotal).toBe(0);
    expect(snap.aiJobDeadLetterTotal).toBe(0);
    expect(snap.llmSummaryJobPendingTotal).toBe(0);
    expect(snap.llmSummaryJobRetryTotal).toBe(0);
    expect(snap.llmSummaryJobDeadLetterTotal).toBe(0);
    expect(snap.serverAiLatencyMs).toEqual([]);
    expect(snap.serverAiFailureTotal).toBe(0);
  });
});

