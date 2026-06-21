import { logger } from '@backend/shared/utils';
import { ProctoringDataRequestRepository } from '@backend/shared/db/repositories/proctoringDataRequest.repository';
import { ProctoringDeletionRepository } from '@backend/shared/db/repositories/proctoringDeletion.repository';

type Dependencies = {
  dataRequestRepository?: ProctoringDataRequestRepository;
  deletionRepository?: ProctoringDeletionRepository;
  env?: string;
};

function ensureError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ProctoringDataRequestWorkerService {
  private readonly dataRequestRepository: ProctoringDataRequestRepository;
  private readonly deletionRepository: ProctoringDeletionRepository;
  private readonly env: string;

  constructor(deps: Dependencies = {}) {
    this.dataRequestRepository =
      deps.dataRequestRepository ?? new ProctoringDataRequestRepository();
    this.deletionRepository = deps.deletionRepository ?? new ProctoringDeletionRepository();
    this.env = deps.env ?? process.env.NODE_ENV ?? 'development';
  }

  async processNext(): Promise<{ status: 'idle' | 'completed' | 'failed'; requestId?: string }> {
    const pending = await this.dataRequestRepository.findPendingExecution(1);
    if (!pending.length || !pending[0]) {
      return { status: 'idle' };
    }

    const request = pending[0];
    const participationId = request.participationId;
    if (!participationId) {
      await this.dataRequestRepository.updateStatus(request.id, {
        status: 'failed',
        evidenceReportJson: { error: 'Missing participationId.' },
      } as any);
      return { status: 'failed', requestId: request.id };
    }

    if (request.dryRunMode === 'dry_run') {
      logger.warn(`[ProctoringDataRequestWorker] Skipping already dry-run request ${request.id}`);
      return { status: 'idle', requestId: request.id };
    }

    await this.dataRequestRepository.updateStatus(request.id, {
      status: 'in_progress',
    } as any);

    const isDryRun = request.lastExecutionDryRun !== false;

    try {
      if (isDryRun) {
        return this.processDryRun(request.id, participationId);
      }

      if (this.env !== 'staging' && this.env !== 'test') {
        await this.dataRequestRepository.updateStatus(request.id, {
          status: 'validated',
          evidenceReportJson: {
            dryRun: false,
            environment: this.env,
            blocked: true,
            reason: 'mutation_refused',
            note: 'Mutating execution is only allowed in staging environment.',
          },
        } as any);
        return { status: 'failed', requestId: request.id };
      }

      if (request.legalHoldUntil && new Date(request.legalHoldUntil) > new Date()) {
        await this.dataRequestRepository.updateStatus(request.id, {
          status: 'blocked_legal_hold',
          evidenceReportJson: {
            dryRun: false,
            environment: this.env,
            blocked: true,
            reason: 'legal_hold_active',
            legalHoldUntil: request.legalHoldUntil,
          },
        } as any);
        return { status: 'failed', requestId: request.id };
      }

      return this.processMutation(request.id, participationId);
    } catch (error) {
      const message = ensureError(error);
      logger.error(`[ProctoringDataRequestWorker] Execution failed for ${request.id}: ${message}`);

      await this.dataRequestRepository.updateStatus(request.id, {
        status: 'failed',
        evidenceReportJson: {
          dryRun: isDryRun,
          environment: this.env,
          error: message,
        },
      } as any);

      return { status: 'failed', requestId: request.id };
    }
  }

  private async processDryRun(
    requestId: string,
    participationId: string
  ): Promise<{ status: 'completed'; requestId: string }> {
    const { rows } = await this.deletionRepository.dryRunCounts(participationId);

    await this.dataRequestRepository.updateStatus(requestId, {
      status: 'validated',
      dryRunMode: 'dry_run',
      evidenceReportJson: {
        dryRun: true,
        environment: this.env,
        affectedTables: rows,
        completedAt: new Date().toISOString(),
      },
    } as any);

    return { status: 'completed', requestId };
  }

  private async processMutation(
    requestId: string,
    participationId: string
  ): Promise<{ status: 'completed'; requestId: string }> {
    const evidence: Record<string, unknown> = {
      dryRun: false,
      environment: this.env,
      startedAt: new Date().toISOString(),
    };

    try {
      const counts: Record<string, number> = {};

      counts.events = await this.deletionRepository.anonymizeEvents(participationId);
      counts.summaries = await this.deletionRepository.anonymizeSummaries(participationId);
      counts.aiJobs = await this.deletionRepository.redactAiJobPayloads(participationId);
      counts.anomalyResults = await this.deletionRepository.redactAnomalyResults(participationId);
      counts.reviewLabels = await this.deletionRepository.redactReviewLabels(participationId);
      counts.llmSummaries = await this.deletionRepository.redactLlmSummaries(participationId);

      evidence.mutationCounts = counts;
      evidence.completedAt = new Date().toISOString();

      await this.dataRequestRepository.updateStatus(requestId, {
        status: 'completed',
        dryRunMode: 'mutating',
        completedAt: new Date(),
        evidenceReportJson: evidence,
      } as any);
    } catch (error) {
      evidence.error = ensureError(error);
      await this.dataRequestRepository.updateStatus(requestId, {
        status: 'failed',
        dryRunMode: 'mutating',
        evidenceReportJson: evidence,
      } as any);
      throw error;
    }

    return { status: 'completed', requestId };
  }
}

export function createProctoringDataRequestWorkerService(): ProctoringDataRequestWorkerService {
  return new ProctoringDataRequestWorkerService();
}
