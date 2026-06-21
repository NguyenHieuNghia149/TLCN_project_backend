import { ProctoringFinalFlushRepository } from '@backend/api/repositories/proctoring/proctoringFinalFlush.repository';

import {
  createProctoringMetricsService,
  ProctoringMetricsService,
} from './proctoring-metrics.service';
import {
  createProctoringSummaryService,
  ProctoringSummaryService,
} from './proctoring-summary.service';

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
  summaryService?: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
  metricsService?: Pick<ProctoringMetricsService, 'recordFinalFlushPollDuration' | 'incrementFinalFlushSuccess' | 'incrementFinalFlushTimeout' | 'incrementFinalFlushFailed'>;
};

const inFlightStatuses = new Set(['received', 'persisting']);

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ProctoringSubmitGuardService {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly intervalMs: number;
  private readonly maxAttempts: number;
  private readonly summaryService: Pick<ProctoringSummaryService, 'recomputeForParticipation'>;
  private readonly metricsService: Pick<ProctoringMetricsService, 'recordFinalFlushPollDuration' | 'incrementFinalFlushSuccess' | 'incrementFinalFlushTimeout' | 'incrementFinalFlushFailed'>;

  constructor(private readonly deps: ProctoringSubmitGuardDependencies) {
    this.sleep = deps.sleep ?? defaultSleep;
    this.intervalMs = deps.intervalMs ?? 500;
    this.maxAttempts = deps.maxAttempts ?? 10;
    this.summaryService = deps.summaryService ?? createProctoringSummaryService();
    this.metricsService = deps.metricsService ?? createProctoringMetricsService();
  }

  async awaitFinalFlushReceipt(
    input: ProctoringSubmitGuardInput
  ): Promise<ProctoringSubmitGuardResult> {
    if (!input.submitAttemptId && !input.finalFlushReceiptId) {
      return { status: 'skipped' };
    }

    const pollStart = Date.now();
    let lastReceipt: any = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      lastReceipt = await this.findReceipt(input);

      if (lastReceipt?.status === 'persisted') {
        const elapsed = Date.now() - pollStart;
        this.metricsService.recordFinalFlushPollDuration(elapsed);
        this.metricsService.incrementFinalFlushSuccess();
        return { status: 'persisted', receiptId: lastReceipt.id };
      }

      if (lastReceipt && !inFlightStatuses.has(lastReceipt.status)) {
        if (lastReceipt.status === 'failed' || lastReceipt.status === 'timeout') {
          await this.summaryService.recomputeForParticipation({
            participationId: input.participationId,
            finalFlushStatus: lastReceipt.status,
          });
        }
        const elapsed = Date.now() - pollStart;
        this.metricsService.recordFinalFlushPollDuration(elapsed);
        if (lastReceipt.status === 'failed') {
          this.metricsService.incrementFinalFlushFailed();
        } else {
          this.metricsService.incrementFinalFlushTimeout();
        }
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
      await this.summaryService.recomputeForParticipation({
        participationId: input.participationId,
        finalFlushStatus: 'timeout',
      });
    }

    const elapsed = Date.now() - pollStart;
    this.metricsService.recordFinalFlushPollDuration(elapsed);
    this.metricsService.incrementFinalFlushTimeout();

    return {
      status: 'timeout',
      receiptId: lastReceipt?.id ?? input.finalFlushReceiptId,
    };
  }

  private async findReceipt(input: ProctoringSubmitGuardInput): Promise<any | null> {
    if (input.submitAttemptId) {
      const byAttempt = await this.deps.finalFlushRepository.findByParticipationAndSubmitAttempt({
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
