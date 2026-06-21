import { performance, monitorEventLoopDelay } from 'perf_hooks';
import { logger } from '@backend/shared/utils';

export function isPerformanceTracingEnabled(): boolean {
  return process.env.API_PERF_TRACE === 'true';
}

export async function timeAsyncStage<T>(
  scope: string,
  stage: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isPerformanceTracingEnabled()) {
    return fn();
  }

  const start = performance.now();
  try {
    return await fn();
  } finally {
    logger.info('API performance stage', {
      scope,
      stage,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    });
  }
}

export function captureEventLoopDelayMs(sampleMs = 100): Promise<number> {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  return new Promise(resolve => {
    setTimeout(() => {
      histogram.disable();
      resolve(Math.round(histogram.mean / 1_000_000));
    }, sampleMs);
  });
}
