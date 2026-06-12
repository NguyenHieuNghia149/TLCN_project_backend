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
});
