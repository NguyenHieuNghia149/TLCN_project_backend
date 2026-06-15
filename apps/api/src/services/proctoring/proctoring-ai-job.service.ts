import { ProctoringAiJobRepository } from '@backend/api/repositories/proctoring/proctoringAiJob.repository';
import { ProctoringConsentRepository } from '@backend/api/repositories/proctoring/proctoringConsent.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
import {
  ExamProctoringEventEntity,
  ProctoringAiJobEntity,
  ProctoringAiJobInsert,
} from '@backend/shared/db/schema';

import { buildDefaultProctoringSettings } from './proctoring-settings.service';

export const PROCTORING_AI_PAYLOAD_SCHEMA_VERSION = 'phase-1-ai-window-v1';

type ProctoringAiJobServiceDependencies = {
  settingsRepository?: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  consentRepository?: Pick<ProctoringConsentRepository, 'findLatestAcceptedForCandidate'>;
  aiJobRepository?: Pick<ProctoringAiJobRepository, 'upsertByJobKey'>;
  globalAiEnabled?: boolean;
  globalShadowMode?: boolean;
};

type EventLike = Pick<
  ExamProctoringEventEntity,
  | 'examId'
  | 'participationId'
  | 'sessionId'
  | 'candidateUserId'
  | 'clientSessionId'
  | 'type'
  | 'severity'
  | 'capturedAt'
>;

export type EnqueueTelemetryWindowInput = {
  events: EventLike[];
  now?: Date;
  modelVersion?: string | null;
  reason?: string;
};

export type EnqueueFinalSubmitWindowInput = EnqueueTelemetryWindowInput & {
  submitAttemptId: string;
};

function envFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce<Record<T, number>>(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>
  );
}

function minDate(events: EventLike[]): Date {
  return events.reduce(
    (min, event) => (event.capturedAt < min ? event.capturedAt : min),
    events[0]!.capturedAt
  );
}

function maxDate(events: EventLike[]): Date {
  return events.reduce(
    (max, event) => (event.capturedAt > max ? event.capturedAt : max),
    events[0]!.capturedAt
  );
}

export class ProctoringAiJobService {
  private readonly settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  private readonly consentRepository: Pick<
    ProctoringConsentRepository,
    'findLatestAcceptedForCandidate'
  >;
  private readonly aiJobRepository: Pick<ProctoringAiJobRepository, 'upsertByJobKey'>;
  private readonly globalAiEnabled: boolean;
  private readonly globalShadowMode: boolean;

  constructor(deps: ProctoringAiJobServiceDependencies = {}) {
    this.settingsRepository = deps.settingsRepository ?? new ProctoringSettingsRepository();
    this.consentRepository = deps.consentRepository ?? new ProctoringConsentRepository();
    this.aiJobRepository = deps.aiJobRepository ?? new ProctoringAiJobRepository();
    this.globalAiEnabled =
      deps.globalAiEnabled ?? envFlagEnabled(process.env.PROCTORING_AI_ENABLED, true);
    this.globalShadowMode =
      deps.globalShadowMode ?? envFlagEnabled(process.env.PROCTORING_AI_SHADOW_MODE, true);
  }

  async enqueueTelemetryWindow(
    input: EnqueueTelemetryWindowInput
  ): Promise<ProctoringAiJobEntity | null> {
    if (input.events.length === 0) {
      return null;
    }

    const context = await this.buildContext(input.events);
    if (!context) {
      return null;
    }

    const windowEnd = maxDate(input.events);
    const windowStart = new Date(windowEnd.getTime() - context.windowSeconds * 1000);
    const jobKey = [
      'proctoring-ai',
      'rolling',
      context.first.participationId,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    ].join(':');

    return this.upsertJob({
      events: input.events,
      jobKey,
      windowStart,
      windowEnd,
      consentRecordId: context.consentRecordId,
      priority: 0,
      now: input.now ?? new Date(),
      modelVersion: input.modelVersion,
      reason: input.reason,
    });
  }

  async enqueueFinalSubmitWindow(
    input: EnqueueFinalSubmitWindowInput
  ): Promise<ProctoringAiJobEntity | null> {
    if (input.events.length === 0) {
      return null;
    }

    const context = await this.buildContext(input.events);
    if (!context) {
      return null;
    }

    const jobKey = `proctoring-ai:final:${context.first.participationId}:${input.submitAttemptId}`;
    return this.upsertJob({
      events: input.events,
      jobKey,
      windowStart: minDate(input.events),
      windowEnd: maxDate(input.events),
      consentRecordId: context.consentRecordId,
      priority: 10,
      now: input.now ?? new Date(),
      submitAttemptId: input.submitAttemptId,
      modelVersion: input.modelVersion,
      reason: input.reason,
    });
  }

  async enqueueManualRecomputeWindow(
    input: EnqueueTelemetryWindowInput
  ): Promise<ProctoringAiJobEntity | null> {
    if (input.events.length === 0) {
      return null;
    }

    const context = await this.buildContext(input.events);
    if (!context) {
      return null;
    }

    const now = input.now ?? new Date();
    const modelVersion = input.modelVersion?.trim() || null;
    const jobKey = [
      'proctoring-ai',
      'recompute',
      context.first.participationId,
      modelVersion ?? 'default',
      now.toISOString(),
    ].join(':');

    return this.upsertJob({
      events: input.events,
      jobKey,
      windowStart: minDate(input.events),
      windowEnd: maxDate(input.events),
      consentRecordId: context.consentRecordId,
      priority: 20,
      now,
      modelVersion,
      reason: input.reason,
      jobType: 'anomaly_recompute',
    });
  }

  private async buildContext(events: EventLike[]): Promise<{
    first: EventLike;
    consentRecordId: string;
    windowSeconds: number;
  } | null> {
    const first = events[0]!;
    const settings =
      (await this.settingsRepository.findByExamId(first.examId)) ??
      buildDefaultProctoringSettings(first.examId);

    if (
      !this.globalAiEnabled ||
      !this.globalShadowMode ||
      !settings.enabled ||
      !settings.aiAnomalyEnabled ||
      !settings.aiShadowMode
    ) {
      return null;
    }

    const consent = await this.consentRepository.findLatestAcceptedForCandidate({
      examId: first.examId,
      candidateUserId: first.candidateUserId,
      clientSessionId: first.clientSessionId,
    });
    if (!consent) {
      return null;
    }

    return {
      first,
      consentRecordId: consent.id,
      windowSeconds: settings.aiJobWindowSeconds ?? 300,
    };
  }

  private async upsertJob(input: {
    events: EventLike[];
    jobKey: string;
    windowStart: Date;
    windowEnd: Date;
    consentRecordId: string;
    priority: number;
    now: Date;
    submitAttemptId?: string;
    modelVersion?: string | null;
    reason?: string;
    jobType?: ProctoringAiJobInsert['jobType'];
  }): Promise<ProctoringAiJobEntity> {
    const first = input.events[0]!;
    const payloadJson = this.buildPayload({
      ...input,
      first,
    });
    const values: ProctoringAiJobInsert = {
      jobKey: input.jobKey,
      jobType: input.jobType ?? 'anomaly_prediction',
      examId: first.examId,
      participationId: first.participationId,
      sessionId: first.sessionId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: 'pending',
      priority: input.priority,
      payloadJson,
      payloadSchemaVersion: PROCTORING_AI_PAYLOAD_SCHEMA_VERSION,
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: input.now,
      modelVersion: input.modelVersion ?? undefined,
    };

    return this.aiJobRepository.upsertByJobKey(values);
  }

  private buildPayload(input: {
    first: EventLike;
    events: EventLike[];
    jobKey: string;
    windowStart: Date;
    windowEnd: Date;
    consentRecordId: string;
    submitAttemptId?: string;
    modelVersion?: string | null;
    reason?: string;
  }): Record<string, unknown> {
    const eventCounts = countBy(input.events.map(event => event.type));
    const severityCounts = countBy(input.events.map(event => event.severity));
    const windowMinutes = Math.max(
      1 / 60,
      (input.windowEnd.getTime() - input.windowStart.getTime()) / 60000
    );

    return {
      schemaVersion: 1,
      windowId: input.jobKey,
      examId: input.first.examId,
      participationId: input.first.participationId,
      candidateUserId: input.first.candidateUserId,
      consentRecordId: input.consentRecordId,
      startedAt: input.windowStart.toISOString(),
      endedAt: input.windowEnd.toISOString(),
      features: {
        totalEvents: input.events.length,
        warningEvents: severityCounts.warning ?? 0,
        criticalEvents: severityCounts.critical ?? 0,
        eventTypeCount: Object.keys(eventCounts).length,
        eventRatePerMinute: Number((input.events.length / windowMinutes).toFixed(6)),
      },
      context: {
        eventCounts,
        submitAttemptId: input.submitAttemptId,
        selectedModelVersion: input.modelVersion ?? undefined,
        recomputeReason: input.reason,
      },
    };
  }
}

export function createProctoringAiJobService(): ProctoringAiJobService {
  return new ProctoringAiJobService();
}
