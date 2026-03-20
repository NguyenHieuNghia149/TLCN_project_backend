import { logger } from '@backend/shared/utils';
import CircuitBreaker from 'opossum';
import { Worker } from 'bullmq';
import {
  GrpcExecutionRequest,
  GrpcExecutionResponse,
  ISandboxGrpcClient,
} from './client';

const BREAKER_OPTIONS: CircuitBreaker.Options = {
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
  timeout: 30000,
  name: 'SandboxGrpcCircuitBreaker',
};

export function createSandboxBreaker(
  bullWorker: Worker,
  sandboxClient: ISandboxGrpcClient
): CircuitBreaker {
  const breaker = new CircuitBreaker(
    async (request: GrpcExecutionRequest): Promise<GrpcExecutionResponse> => {
      return sandboxClient.executeCode(request);
    },
    BREAKER_OPTIONS
  );

  breaker.on('open', () => {
    logger.warn('[CircuitBreaker] Circuit OPEN - Sandbox is DOWN. Pausing BullMQ Worker...');
    bullWorker.pause();
  });

  breaker.on('halfOpen', () => {
    logger.info('[CircuitBreaker] Circuit HALF-OPEN - Sending probe request to Sandbox...');
  });

  breaker.on('close', () => {
    logger.info('[CircuitBreaker] Circuit CLOSED - Sandbox recovered. Resuming BullMQ Worker.');
    bullWorker.resume();
  });

  breaker.on('success', (_result: GrpcExecutionResponse) => {
    // Keep verbose success logging off by default.
  });

  breaker.on('failure', (error: Error) => {
    logger.error('[CircuitBreaker] Call FAILED:', error.message);
  });

  breaker.on('timeout', () => {
    logger.warn('[CircuitBreaker] Call TIMED OUT - counted as failure');
  });

  breaker.on('reject', () => {
    logger.warn('[CircuitBreaker] Call REJECTED - circuit is OPEN');
  });

  breaker.on('fallback', (result: any) => {
    logger.warn('[CircuitBreaker] Fallback result:', result);
  });

  breaker.fallback((request: GrpcExecutionRequest) => {
    const fallback: GrpcExecutionResponse = {
      submission_id: request.submission_id,
      overall_status: 'SYSTEM_ERROR',
      compile_error: '',
      results: [],
    };
    return fallback;
  });

  return breaker;
}

export type SandboxBreaker = ReturnType<typeof createSandboxBreaker>;
