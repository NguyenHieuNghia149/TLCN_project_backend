import { logger } from '@backend/shared/utils';
import CircuitBreaker from 'opossum';
import { Worker } from 'bullmq';
import { sandboxGrpcClient, GrpcExecutionRequest, GrpcExecutionResponse } from './client';

const BREAKER_OPTIONS: CircuitBreaker.Options = {
  // Trip the breaker after 50% of calls fail
  errorThresholdPercentage: 50,
  // Wait 30 seconds before trying again (HALF_OPEN state)
  resetTimeout: 30000,
  // Minimum calls before the circuit can trip
  volumeThreshold: 5,
  // Timeout per individual gRPC call (ms)
  timeout: 30000,
  // Name for observability
  name: 'SandboxGrpcCircuitBreaker',
};

async function callSandbox(request: GrpcExecutionRequest): Promise<GrpcExecutionResponse> {
  return sandboxGrpcClient.executeCode(request);
}

export function createSandboxBreaker(bullWorker: Worker): CircuitBreaker {
  const breaker = new CircuitBreaker(callSandbox, BREAKER_OPTIONS);

  // ── State event handlers ──────────────────────────────────────────────────

  // Circuit OPEN: sandbox is unhealthy — pause queue to avoid piling up jobs
  breaker.on('open', () => {
    logger.warn('[CircuitBreaker] ⚡ Circuit OPEN — Sandbox is DOWN. Pausing BullMQ Worker...');
    bullWorker.pause();
  });

  // Circuit HALF-OPEN: attempting recovery probe
  breaker.on('halfOpen', () => {
    logger.info('[CircuitBreaker] 🔶 Circuit HALF-OPEN — Sending probe request to Sandbox...');
  });

  // Circuit CLOSED: sandbox is healthy again — resume the queue
  breaker.on('close', () => {
    logger.info('[CircuitBreaker] ✅ Circuit CLOSED — Sandbox recovered. Resuming BullMQ Worker.');
    bullWorker.resume();
  });

  // ── Observability events ──────────────────────────────────────────────────

  breaker.on('success', (_result: GrpcExecutionResponse) => {
    // Uncomment for verbose logging:
    // logger.info(`[CircuitBreaker] Call succeeded — submission: ${result.submission_id}`);
  });

  breaker.on('failure', (error: Error) => {
    logger.error('[CircuitBreaker] Call FAILED:', error.message);
  });

  breaker.on('timeout', () => {
    logger.warn('[CircuitBreaker] ⏱️  Call TIMED OUT — counted as failure');
  });

  breaker.on('reject', () => {
    logger.warn('[CircuitBreaker] 🚫 Call REJECTED — circuit is OPEN');
  });

  breaker.on('fallback', (result: any) => {
    logger.warn('[CircuitBreaker] Fallback result:', result);
  });

  // Default fallback: return a CIRCUIT_OPEN error response instead of crashing
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

// ─────────────────────────────────────────────────────────────────────────────
// Helper type for callers
// ─────────────────────────────────────────────────────────────────────────────
export type SandboxBreaker = ReturnType<typeof createSandboxBreaker>;
