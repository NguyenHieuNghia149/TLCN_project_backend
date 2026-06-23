import { AppException } from '@backend/api/exceptions/base.exception';
import { AdminAuditLogRepository } from '@backend/api/repositories/adminAuditLog.repository';
import { ProctoringAiJobRepository } from '@backend/api/repositories/proctoring/proctoringAiJob.repository';
import { ProctoringSettingsRepository } from '@backend/api/repositories/proctoring/proctoringSettings.repository';
import { ProctoringLlmSummaryRepository } from '@backend/shared/db/repositories/proctoringLlmSummary.repository';

import {
  createProctoringLlmSummaryInputService,
  ProctoringLlmSummaryInputService,
} from './proctoring-llm-summary-input.service';
import {
  createProctoringModelRegistryService,
  ProctoringModelRegistryService,
} from './proctoring-model-registry.service';
import {
  createProctoringMetricsService,
  ProctoringMetricsService,
} from './proctoring-metrics.service';

type Actor = {
  userId?: string | null;
  role?: string | null;
};

type Dependencies = {
  settingsRepository?: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  modelRegistryService?: Pick<ProctoringModelRegistryService, 'resolveSummaryModel'>;
  inputService?: Pick<ProctoringLlmSummaryInputService, 'buildInput'>;
  summaryRepository?: Pick<
    ProctoringLlmSummaryRepository,
    'insertOrFindActive' | 'updateJobId' | 'countActiveRecentForParticipation'
  >;
  aiJobRepository?: Pick<ProctoringAiJobRepository, 'insert' | 'upsertByJobKey'>;
  auditLogRepository?: Pick<AdminAuditLogRepository, 'create'>;
  metricsService?: Pick<ProctoringMetricsService, 'incrementSummaryRequested' | 'incrementSummaryRateLimited'>;
  nowFactory?: () => Date;
};

function numericSetting(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function unwrapSummaryInsertResult(value: any): { row: any; conflictResolved: boolean } {
  if (value?.row) {
    return value;
  }
  return { row: value, conflictResolved: false };
}

export class ProctoringLlmSummaryService {
  private readonly settingsRepository: Pick<ProctoringSettingsRepository, 'findByExamId'>;
  private readonly modelRegistryService: Pick<ProctoringModelRegistryService, 'resolveSummaryModel'>;
  private readonly inputService: Pick<ProctoringLlmSummaryInputService, 'buildInput'>;
  private readonly summaryRepository: Pick<
    ProctoringLlmSummaryRepository,
    'insertOrFindActive' | 'updateJobId' | 'countActiveRecentForParticipation'
  >;
  private readonly aiJobRepository: Pick<ProctoringAiJobRepository, 'insert' | 'upsertByJobKey'>;
  private readonly auditLogRepository: Pick<AdminAuditLogRepository, 'create'>;
  private readonly metricsService: Pick<ProctoringMetricsService, 'incrementSummaryRequested' | 'incrementSummaryRateLimited'>;
  private readonly nowFactory: () => Date;

  constructor(deps: Dependencies = {}) {
    this.settingsRepository = deps.settingsRepository ?? new ProctoringSettingsRepository();
    this.modelRegistryService = deps.modelRegistryService ?? createProctoringModelRegistryService();
    this.inputService = deps.inputService ?? createProctoringLlmSummaryInputService();
    this.summaryRepository = deps.summaryRepository ?? new ProctoringLlmSummaryRepository();
    this.aiJobRepository = deps.aiJobRepository ?? new ProctoringAiJobRepository();
    this.auditLogRepository = deps.auditLogRepository ?? new AdminAuditLogRepository();
    this.metricsService = deps.metricsService ?? createProctoringMetricsService();
    this.nowFactory = deps.nowFactory ?? (() => new Date());
  }

  async generate(input: { examId: string; participationId: string; actor: Actor }) {
    const settings = await this.settingsRepository.findByExamId(input.examId);
    if (!settings?.llmSummaryEnabled) {
      throw new AppException(
        'LLM summary generation is disabled for this exam.',
        400,
        'PROCTORING_LLM_SUMMARY_DISABLED'
      );
    }
    const summaryProvider =
      settings.llmSummaryProvider && settings.llmSummaryProvider !== 'disabled'
        ? settings.llmSummaryProvider
        : 'local';

    if (settings.llmSummaryProvider === 'disabled') {
      throw new AppException(
        'LLM summary provider is disabled.',
        400,
        'PROCTORING_LLM_PROVIDER_DISABLED'
      );
    }

    const model = await this.modelRegistryService.resolveSummaryModel(
      settings.llmSummaryModelVersion ?? null,
      'summary_generator'
    );
    const judgeEnabled = settings.llmSummaryJudgeEnabled !== false;
    const judgeModel = judgeEnabled
      ? await this.modelRegistryService.resolveSummaryModel(null, 'summary_judge')
      : null;

    const promptVersion = settings.llmSummaryPromptVersion ?? 'proctoring-summary-v1';
    const rateLimitPerParticipation = settings.llmSummaryRateLimitPerParticipation ?? 3;
    const rateLimitWindowHours = settings.llmSummaryRateLimitWindowHours ?? 24;
    const now = this.nowFactory();
    const rateLimitSince = new Date(now.getTime() - rateLimitWindowHours * 60 * 60 * 1000);
    const recentCount = await this.summaryRepository.countActiveRecentForParticipation(
      input.participationId,
      rateLimitSince
    );
    if (recentCount >= rateLimitPerParticipation) {
      this.metricsService.incrementSummaryRateLimited();
      throw new AppException(
        'LLM summary rate limit exceeded for this participation.',
        429,
        'PROCTORING_LLM_SUMMARY_RATE_LIMITED'
      );
    }

    const built = await this.inputService.buildInput({
      examId: input.examId,
      participationId: input.participationId,
    });
    const minValidationScore = numericSetting(settings.llmSummaryMinValidationScore, 0.85);
    const summaryResult = unwrapSummaryInsertResult(
      await this.summaryRepository.insertOrFindActive({
        examId: input.examId,
        participationId: input.participationId,
        deterministicSummaryId: built.input.deterministicSummaryId,
        provider: summaryProvider,
        modelVersion: model.modelVersion,
        promptVersion,
        inputSchemaVersion: 'proctoring-summary-input-v1',
        outputSchemaVersion: 'proctoring-summary-output-v1',
        inputHash: built.inputHash,
        status: 'pending',
        validationStatus: 'not_run',
        requestedBy: input.actor.userId ?? null,
        createdAt: now,
        updatedAt: now,
      } as any)
    );
    if (
      summaryResult.conflictResolved &&
      (summaryResult.row.status === 'pending' || summaryResult.row.status === 'accepted')
    ) {
      return {
        llmSummaryId: summaryResult.row.id,
        status: summaryResult.row.status === 'accepted' ? 'accepted' : 'pending',
        conflictResolved: true,
      };
    }

    this.metricsService.incrementSummaryRequested();

    const job = await this.aiJobRepository.upsertByJobKey({
      jobKey: [
        'proctoring-llm-summary',
        input.participationId,
        built.inputHash,
        promptVersion,
        model.modelVersion,
      ].join(':'),
      jobType: 'llm_summary_generation',
      examId: input.examId,
      participationId: input.participationId,
      sessionId: null,
      windowStart: now,
      windowEnd: now,
      status: 'pending',
      priority: 15,
      payloadSchemaVersion: 'proctoring-summary-input-v1',
      payloadJson: {
        ...built.input,
        llmSummaryId: summaryResult.row.id,
        inputHash: built.inputHash,
        provider: summaryProvider,
        modelVersion: model.modelVersion,
        judgeModelVersion: judgeModel?.modelVersion ?? null,
        promptVersion,
        minValidationScore,
        judgeEnabled,
      },
      modelVersion: model.modelVersion,
      featureSchemaVersion: 'proctoring-summary-input-v1',
      scoringSchemaVersion: 'proctoring-summary-output-v1',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
    } as any);
    await this.summaryRepository.updateJobId(summaryResult.row.id, job.id);
    await this.auditLogRepository.create({
      actorType: input.actor.userId ? 'user' : 'system',
      actorId: input.actor.userId ?? null,
      action: 'proctoring_llm_summary_generate',
      targetType: 'exam_participation',
      targetId: input.participationId,
      metadata: {
        llmSummaryId: summaryResult.row.id,
        jobId: job.id,
        modelVersion: model.modelVersion,
        judgeModelVersion: judgeModel?.modelVersion ?? null,
        promptVersion,
        inputHash: built.inputHash,
      },
    } as any);

    return {
      llmSummaryId: summaryResult.row.id,
      status: summaryResult.row.status === 'accepted' ? 'accepted' : 'pending',
      conflictResolved: summaryResult.conflictResolved,
    };
  }
}

export function createProctoringLlmSummaryService(): ProctoringLlmSummaryService {
  return new ProctoringLlmSummaryService();
}
