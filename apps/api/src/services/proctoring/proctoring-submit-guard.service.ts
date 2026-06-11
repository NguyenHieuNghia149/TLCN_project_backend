import { ProctoringFinalFlushRepository } from '@backend/api/repositories/proctoring/proctoringFinalFlush.repository';

export type ProctoringSubmitGuardInput = {
  participationId: string;
  submitAttemptId?: string;
  finalFlushReceiptId?: string;
};

export type ProctoringSubmitGuardResult = {
  status: 'skipped' | 'persisted' | 'timeout' | 'failed';
  receiptId?: string;
};

type ProctoringSubmitGuardDependencies = {
  finalFlushRepository: Pick<
    ProctoringFinalFlushRepository,
    'findById' | 'findByParticipationAndSubmitAttempt' | 'transitionStatus'
  >;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxAttempts?: number;
};

const inFlightStatuses = new Set(['received', 'persisting']);

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ProctoringSubmitGuardService {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly intervalMs: number;
  private readonly maxAttempts: number;

  constructor(private readonly deps: ProctoringSubmitGuardDependencies) {
    this.sleep = deps.sleep ?? defaultSleep;
    this.intervalMs = deps.intervalMs ?? 500;
    this.maxAttempts = deps.maxAttempts ?? 10;
  }

  async awaitFinalFlushReceipt(
    input: ProctoringSubmitGuardInput,
  ): Promise<ProctoringSubmitGuardResult> {
    if (!input.submitAttemptId && !input.finalFlushReceiptId) {
      return { status: 'skipped' };
    }

    let lastReceipt: any = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      lastReceipt = await this.findReceipt(input);

      if (lastReceipt?.status === 'persisted') {
        return { status: 'persisted', receiptId: lastReceipt.id };
      }

      if (lastReceipt && !inFlightStatuses.has(lastReceipt.status)) {
        return {
          status: lastReceipt.status === 'failed' ? 'failed' : 'timeout',
          receiptId: lastReceipt.id,
        };
      }

      if (attempt < this.maxAttempts - 1) {
        await this.sleep(this.intervalMs);
      }
    }

    if (lastReceipt?.id) {
      await this.deps.finalFlushRepository.transitionStatus({
        receiptId: lastReceipt.id,
        fromStatuses: ['received', 'persisting'],
        toStatus: 'timeout',
        errorCode: 'final_telemetry_flush_timeout',
      });
    }

    return {
      status: 'timeout',
      receiptId: lastReceipt?.id ?? input.finalFlushReceiptId,
    };
  }

  private async findReceipt(input: ProctoringSubmitGuardInput): Promise<any | null> {
    if (input.submitAttemptId) {
      const byAttempt =
        await this.deps.finalFlushRepository.findByParticipationAndSubmitAttempt({
          participationId: input.participationId,
          submitAttemptId: input.submitAttemptId,
        });
      if (byAttempt) {
        return byAttempt;
      }
    }

    if (input.finalFlushReceiptId) {
      return this.deps.finalFlushRepository.findById(input.finalFlushReceiptId);
    }

    return null;
  }
}

export function createProctoringSubmitGuardService(): ProctoringSubmitGuardService {
  return new ProctoringSubmitGuardService({
    finalFlushRepository: new ProctoringFinalFlushRepository(),
  });
}
