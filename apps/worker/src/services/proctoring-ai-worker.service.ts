import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';

import { db } from '@backend/shared/db/connection';
import { ProctoringAiJobEntity, proctoringAiJobs } from '@backend/shared/db/schema';
import { logger } from '@backend/shared/utils';

import {
  ProctoringAiExplanation,
  ProctoringAiExplanationRequest,
  ProctoringAiHttpClient,
  ProctoringAiPrediction,
  ProctoringAiTelemetryWindow,
  ProctoringLlmSummaryResponse,
} from './proctoring-ai-http-client';
import { ProctoringAiResultWriterService } from './proctoring-ai-result-writer.service';

type ProctoringAiJobRepositoryLike = {
  claimNext(input: { workerId: string; now?: Date }): Promise<ProctoringAiJobEntity | null>;
  upsertByJobKey(values: Partial<ProctoringAiJobEntity>): Promise<ProctoringAiJobEntity>;
  updateStatus(
    id: string,
    patch: Partial<ProctoringAiJobEntity>
  ): Promise<ProctoringAiJobEntity | null>;
};

export type ProctoringAiWorkerProcessResult = {
  status: 'idle' | 'completed' | 'retry' | 'dead_letter' | 'circuit_open';
  jobId?: string;
};

type ProctoringAiWorkerServiceDependencies = {
  jobRepository?: ProctoringAiJobRepositoryLike;
  httpClient?: Pick<ProctoringAiHttpClient, 'predict' | 'explain' | 'generateSummary'>;
  resultWriter?: Pick<
    ProctoringAiResultWriterService,
    | 'persistPrediction'
    | 'persistExplanation'
    | 'markExplanationFailed'
    | 'persistSummary'
    | 'markSummaryFailed'
  >;
  workerId?: string;
  pollIntervalMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
  maxBackoffMs?: number;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asTelemetryWindow(payload: Record<string, unknown>): ProctoringAiTelemetryWindow {
  return payload as ProctoringAiTelemetryWindow;
}

function asExplanationRequest(payload: Record<string, unknown>): ProctoringAiExplanationRequest {
  return payload as ProctoringAiExplanationRequest;
}

export class WorkerProctoringAiJobRepository implements ProctoringAiJobRepositoryLike {
  constructor(private readonly database: any = db) {}

  async claimNext(input: { workerId: string; now?: Date }): Promise<ProctoringAiJobEntity | null> {
    const now = input.now ?? new Date();
    const statuses = ['pending', 'retry'];
    const [candidate] = await this.database
      .select()
      .from(proctoringAiJobs)
      .where(and(inArray(proctoringAiJobs.status, statuses), lte(proctoringAiJobs.nextRunAt, now)))
      .orderBy(desc(proctoringAiJobs.priority), asc(proctoringAiJobs.nextRunAt))
      .limit(1);

    if (!candidate) {
      return null;
    }

    const [claimed] = await this.database
      .update(proctoringAiJobs)
      .set({
        status: 'running',
        lockedBy: input.workerId,
        lockedAt: now,
        attempts: (candidate.attempts ?? 0) + 1,
        updatedAt: now,
      })
      .where(and(eq(proctoringAiJobs.id, candidate.id), inArray(proctoringAiJobs.status, statuses)))
      .returning();

    return claimed ?? null;
  }

  async upsertByJobKey(values: Partial<ProctoringAiJobEntity>): Promise<ProctoringAiJobEntity> {
    const [row] = await this.database
      .insert(proctoringAiJobs)
      .values(values)
      .onConflictDoUpdate({
        target: proctoringAiJobs.jobKey,
        set: {
          payloadJson: values.payloadJson,
          payloadSchemaVersion: values.payloadSchemaVersion,
          priority: values.priority ?? 0,
          windowStart: values.windowStart,
          windowEnd: values.windowEnd,
          nextRunAt: values.nextRunAt ?? new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async updateStatus(
    id: string,
    patch: Partial<ProctoringAiJobEntity>
  ): Promise<ProctoringAiJobEntity | null> {
    const [row] = await this.database
      .update(proctoringAiJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(proctoringAiJobs.id, id))
      .returning();
    return row ?? null;
  }
}

export class ProctoringAiWorkerService {
  private readonly jobRepository: ProctoringAiJobRepositoryLike;
  private readonly httpClient: Pick<ProctoringAiHttpClient, 'predict' | 'explain' | 'generateSummary'>;
  private readonly resultWriter: Pick<
    ProctoringAiResultWriterService,
    | 'persistPrediction'
    | 'persistExplanation'
    | 'markExplanationFailed'
    | 'persistSummary'
    | 'markSummaryFailed'
  >;
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly circuitFailureThreshold: number;
  private readonly circuitOpenMs: number;
  private readonly maxBackoffMs: number;
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private circuitOpenUntil: Date | null = null;

  constructor(deps: ProctoringAiWorkerServiceDependencies = {}) {
    this.jobRepository = deps.jobRepository ?? new WorkerProctoringAiJobRepository();
    this.httpClient = deps.httpClient ?? new ProctoringAiHttpClient();
    this.resultWriter = deps.resultWriter ?? new ProctoringAiResultWriterService();
    this.workerId = deps.workerId ?? `proctoring-ai-${process.pid}-${Date.now()}`;
    this.pollIntervalMs = deps.pollIntervalMs ?? 5000;
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? defaultSleep;
    this.circuitFailureThreshold = deps.circuitFailureThreshold ?? 5;
    this.circuitOpenMs = deps.circuitOpenMs ?? 30000;
    this.maxBackoffMs = deps.maxBackoffMs ?? 300000;
  }

  async start(): Promise<void> {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.processNextSafely();
    }, this.pollIntervalMs);
    this.timer.unref?.();
    void this.processNextSafely();
  }

  async stop(): Promise<void> {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async processNext(): Promise<ProctoringAiWorkerProcessResult> {
    const now = this.now();
    if (this.circuitOpenUntil && this.circuitOpenUntil > now) {
      return { status: 'circuit_open', jobId: undefined };
    }

    const job = await this.jobRepository.claimNext({ workerId: this.workerId, now });
    if (!job) {
      return { status: 'idle' };
    }

    try {
      if (job.jobType === 'anomaly_explanation') {
        const result = await this.httpClient.explain(asExplanationRequest(job.payloadJson));
        await this.completeExplanationJob(job, result, now);
      } else if (job.jobType === 'llm_summary_generation') {
        const result = await this.httpClient.generateSummary(job.payloadJson);
        await this.completeSummaryJob(job, result, now);
      } else {
        const result = await this.httpClient.predict(asTelemetryWindow(job.payloadJson));
        await this.completeJob(job, result, now);
      }
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = null;
      return { status: 'completed', jobId: job.id };
    } catch (error) {
      return this.handleFailure(job, error, now);
    }
  }

  private async processNextSafely(): Promise<void> {
    try {
      await this.processNext();
    } catch (error) {
      logger.error('[ProctoringAiWorker] Processing loop failed:', errorMessage(error));
    }
  }

  private async completeJob(
    job: ProctoringAiJobEntity,
    result: ProctoringAiPrediction,
    now: Date
  ): Promise<void> {
    await this.resultWriter.persistPrediction({
      job,
      prediction: result,
      completedAt: now,
    });
    await this.enqueueExplanationIfNeeded(job, result, now);
    await this.jobRepository.updateStatus(job.id, {
      status: 'completed',
      resultJson: result as unknown as Record<string, unknown>,
      resultModelVersion: result.modelVersion,
      completedAt: now,
      lastError: null,
      lockedBy: null,
      lockedAt: null,
    });
  }

  private async enqueueExplanationIfNeeded(
    job: ProctoringAiJobEntity,
    result: ProctoringAiPrediction,
    now: Date
  ): Promise<void> {
    if (result.riskLevel !== 'high' && result.riskLevel !== 'critical') {
      return;
    }
    if (
      result.explanationStatus === 'completed' ||
      result.explanationStatus === 'skipped' ||
      result.explanationStatus === 'failed'
    ) {
      return;
    }

    const jobKey = [
      'anomaly-explanation',
      job.participationId,
      result.windowId,
      result.modelVersion,
    ].join(':');

    await this.jobRepository.upsertByJobKey({
      jobKey,
      jobType: 'anomaly_explanation',
      parentJobId: job.id,
      examId: job.examId,
      participationId: job.participationId,
      sessionId: job.sessionId,
      windowStart: job.windowStart,
      windowEnd: job.windowEnd,
      status: 'pending',
      priority: 5,
      payloadJson: {
        telemetry: job.payloadJson,
        modelVersion: result.modelVersion,
        anomalyScore: result.anomalyScore,
        riskLevel: result.riskLevel,
      },
      payloadSchemaVersion: 'phase-2-ai-explanation-v1',
      modelVersion: result.modelVersion,
      featureSchemaVersion: job.featureSchemaVersion,
      scoringSchemaVersion: job.scoringSchemaVersion,
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
    });
  }

  private async completeExplanationJob(
    job: ProctoringAiJobEntity,
    result: ProctoringAiExplanation,
    now: Date
  ): Promise<void> {
    await this.resultWriter.persistExplanation({
      job,
      explanation: result,
      completedAt: now,
    });
    await this.jobRepository.updateStatus(job.id, {
      status: 'completed',
      resultJson: result as unknown as Record<string, unknown>,
      resultModelVersion: result.modelVersion,
      completedAt: now,
      lastError: null,
      lockedBy: null,
      lockedAt: null,
    });
  }

  private async completeSummaryJob(
    job: ProctoringAiJobEntity,
    result: ProctoringLlmSummaryResponse,
    now: Date
  ): Promise<void> {
    await this.resultWriter.persistSummary({
      job,
      summary: result,
      completedAt: now,
    });
    await this.jobRepository.updateStatus(job.id, {
      status: 'completed',
      resultJson: {
        validationStatus: result.validationStatus,
        validationScore: result.validationScore,
        validationErrors: result.validationErrors ?? [],
        modelVersion: result.modelVersion,
        promptVersion: result.promptVersion,
        outputSchemaVersion: result.outputSchemaVersion,
      },
      resultModelVersion: result.modelVersion,
      completedAt: now,
      lastError: null,
      lockedBy: null,
      lockedAt: null,
    });
  }

  private async handleFailure(
    job: ProctoringAiJobEntity,
    error: unknown,
    now: Date
  ): Promise<ProctoringAiWorkerProcessResult> {
    const message = errorMessage(error);
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitFailureThreshold) {
      this.circuitOpenUntil = new Date(now.getTime() + this.circuitOpenMs);
    }

    if (job.attempts >= job.maxAttempts) {
      const lastError =
        job.jobType === 'llm_summary_generation' ? 'summary_generation_dead_letter' : message;
      if (job.jobType === 'anomaly_explanation') {
        await this.resultWriter.markExplanationFailed({
          job,
          reason: message,
        });
      } else if (job.jobType === 'llm_summary_generation') {
        await this.resultWriter.markSummaryFailed({
          job,
          reason: message,
          status: 'dead_letter',
        });
      }
      await this.jobRepository.updateStatus(job.id, {
        status: 'dead_letter',
        lastError,
        lockedBy: null,
        lockedAt: null,
      });
      return { status: 'dead_letter', jobId: job.id };
    }

    await this.jobRepository.updateStatus(job.id, {
      status: 'retry',
      lastError: message,
      nextRunAt: new Date(now.getTime() + this.backoffMs(job.attempts)),
      lockedBy: null,
      lockedAt: null,
    });
    return { status: 'retry', jobId: job.id };
  }

  private backoffMs(attempts: number): number {
    return Math.min(this.maxBackoffMs, 1000 * 2 ** attempts);
  }
}

export function createProctoringAiWorkerService(): ProctoringAiWorkerService {
  return new ProctoringAiWorkerService();
}
