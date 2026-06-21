import { logger } from '@backend/shared/utils';
import {
  captureEventLoopDelayMs,
  timeAsyncStage,
  isPerformanceTracingEnabled,
} from '../../../apps/api/src/services/performance-tracing';

describe('performance tracing', () => {
  const original = process.env.API_PERF_TRACE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.API_PERF_TRACE;
    } else {
      process.env.API_PERF_TRACE = original;
    }
    jest.restoreAllMocks();
  });

  it('is disabled by default', () => {
    delete process.env.API_PERF_TRACE;
    expect(isPerformanceTracingEnabled()).toBe(false);
  });

  it('returns the wrapped async result', async () => {
    await expect(timeAsyncStage('auth.login', 'bcrypt', async () => 'ok')).resolves.toBe('ok');
  });

  it('does not log when tracing is disabled', async () => {
    delete process.env.API_PERF_TRACE;
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

    await timeAsyncStage('auth.login', 'bcrypt', async () => 'ok');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('logs scope, stage, and duration when tracing is enabled', async () => {
    process.env.API_PERF_TRACE = 'true';
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

    await timeAsyncStage('auth.login', 'bcrypt', async () => 'ok');

    expect(infoSpy).toHaveBeenCalledWith('API performance stage', {
      scope: 'auth.login',
      stage: 'bcrypt',
      durationMs: expect.any(Number),
    });
  });

  it('logs in finally when the wrapped async function rejects', async () => {
    process.env.API_PERF_TRACE = 'true';
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();
    const error = new Error('auth failed');

    await expect(timeAsyncStage('auth.login', 'bcrypt', async () => {
      throw error;
    })).rejects.toThrow(error);

    expect(infoSpy).toHaveBeenCalledWith('API performance stage', {
      scope: 'auth.login',
      stage: 'bcrypt',
      durationMs: expect.any(Number),
    });
  });

  it('captures event loop delay as a number', async () => {
    await expect(captureEventLoopDelayMs(1)).resolves.toEqual(expect.any(Number));
  });
});
