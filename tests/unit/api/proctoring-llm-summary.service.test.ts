import { ProctoringLlmSummaryService } from '../../../apps/api/src/services/proctoring/proctoring-llm-summary.service';

function createService(overrides: Record<string, unknown> = {}) {
  const defaultSettingsRepository = {
    findByExamId: jest.fn().mockResolvedValue({
      llmSummaryEnabled: false,
      llmSummaryProvider: null,
      llmSummaryModelVersion: null,
      llmSummaryPromptVersion: 'proctoring-summary-v1',
      llmSummaryJudgeEnabled: true,
      llmSummaryMinValidationScore: '0.85',
      llmSummaryRateLimitPerParticipation: 3,
      llmSummaryRateLimitWindowHours: 24,
    }),
  };
  const defaultModelRegistryService = {
    resolveSummaryModel: jest.fn().mockResolvedValue({
      modelVersion: 'summary-local-v1',
      provider: 'local',
      status: 'active',
    }),
  };
  const defaultInputService = {
    buildInput: jest.fn().mockResolvedValue({
      inputHash: 'a'.repeat(64),
      input: {
        schemaVersion: 'proctoring-summary-input-v1',
        examId: 'exam-1',
        participationId: 'participation-1',
        timeline: [],
        riskFacts: [],
        anomalyFacts: [],
        reviewFacts: {},
        missingDataNotes: [],
      },
    }),
  };
  const defaultSummaryRepository = {
    insertOrFindActive: jest.fn().mockResolvedValue({
      id: 'llm-summary-1',
      status: 'pending',
      modelVersion: 'summary-local-v1',
      promptVersion: 'proctoring-summary-v1',
    }),
    updateJobId: jest.fn().mockResolvedValue(null),
    countRecentForParticipation: jest.fn().mockResolvedValue(0),
  };
  const defaultAiJobRepository = {
    insert: jest.fn().mockResolvedValue({ id: 'job-1' }),
    upsertByJobKey: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const defaultAuditLogRepository = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const settingsRepository =
    (overrides.settingsRepository as typeof defaultSettingsRepository) ?? defaultSettingsRepository;
  const modelRegistryService =
    (overrides.modelRegistryService as typeof defaultModelRegistryService) ??
    defaultModelRegistryService;
  const inputService =
    (overrides.inputService as typeof defaultInputService) ?? defaultInputService;
  const summaryRepository =
    (overrides.summaryRepository as typeof defaultSummaryRepository) ?? defaultSummaryRepository;
  const aiJobRepository =
    (overrides.aiJobRepository as typeof defaultAiJobRepository) ?? defaultAiJobRepository;
  const auditLogRepository =
    (overrides.auditLogRepository as typeof defaultAuditLogRepository) ??
    defaultAuditLogRepository;
  const service = new ProctoringLlmSummaryService({
    settingsRepository: settingsRepository as any,
    modelRegistryService: modelRegistryService as any,
    inputService: inputService as any,
    summaryRepository: summaryRepository as any,
    aiJobRepository: aiJobRepository as any,
    auditLogRepository: auditLogRepository as any,
    nowFactory: () => new Date('2026-06-14T10:00:00.000Z'),
    ...(overrides as any),
  });
  return {
    service,
    settingsRepository,
    modelRegistryService,
    inputService,
    summaryRepository,
    aiJobRepository,
    auditLogRepository,
  };
}

describe('ProctoringLlmSummaryService', () => {
  it('rejects generation while LLM summaries are disabled by default', async () => {
    const { service, aiJobRepository } = createService();

    await expect(
      service.generate({
        examId: 'exam-1',
        participationId: 'participation-1',
        actor: { userId: 'owner-1', role: 'owner' },
      })
    ).rejects.toMatchObject({ code: 'PROCTORING_LLM_SUMMARY_DISABLED' });
    expect(aiJobRepository.insert).not.toHaveBeenCalled();
    expect(aiJobRepository.upsertByJobKey).not.toHaveBeenCalled();
  });

  it('inserts pending summary before enqueueing sanitized generation job', async () => {
    const { service, summaryRepository, aiJobRepository } = createService({
      settingsRepository: {
        findByExamId: jest.fn().mockResolvedValue({
          llmSummaryEnabled: true,
          llmSummaryProvider: 'local',
          llmSummaryModelVersion: 'summary-local-v1',
          llmSummaryPromptVersion: 'proctoring-summary-v1',
          llmSummaryJudgeEnabled: true,
          llmSummaryMinValidationScore: '0.85',
          llmSummaryRateLimitPerParticipation: 3,
          llmSummaryRateLimitWindowHours: 24,
        }),
      },
    });

    const result = await service.generate({
      examId: 'exam-1',
      participationId: 'participation-1',
      actor: { userId: 'owner-1', role: 'owner' },
    });

    expect(summaryRepository.insertOrFindActive.mock.invocationCallOrder[0]).toBeLessThan(
      aiJobRepository.upsertByJobKey.mock.invocationCallOrder[0]!
    );
    expect(aiJobRepository.upsertByJobKey).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'llm_summary_generation',
        payloadSchemaVersion: 'proctoring-summary-input-v1',
        payloadJson: expect.objectContaining({
          llmSummaryId: 'llm-summary-1',
          inputHash: 'a'.repeat(64),
          minValidationScore: 0.85,
          timeline: [],
        }),
      })
    );
    expect(
      JSON.stringify(aiJobRepository.upsertByJobKey.mock.calls[0]![0].payloadJson)
    ).not.toMatch(
      /payloadJson|rawClipboard|sourceCode|rawPrompt|rawProviderResponse/
    );
    expect(result).toEqual({
      llmSummaryId: 'llm-summary-1',
      status: 'pending',
      conflictResolved: false,
    });
  });

  it.each(['pending', 'accepted'] as const)(
    'returns an existing active %s summary without enqueueing a duplicate job',
    async status => {
      const { service, summaryRepository, aiJobRepository, auditLogRepository } = createService({
        settingsRepository: {
          findByExamId: jest.fn().mockResolvedValue({
            llmSummaryEnabled: true,
            llmSummaryProvider: 'local',
            llmSummaryModelVersion: 'summary-local-v1',
            llmSummaryPromptVersion: 'proctoring-summary-v1',
            llmSummaryJudgeEnabled: true,
            llmSummaryMinValidationScore: '0.85',
            llmSummaryRateLimitPerParticipation: 3,
            llmSummaryRateLimitWindowHours: 24,
          }),
        },
        summaryRepository: {
          insertOrFindActive: jest.fn().mockResolvedValue({
            row: {
              id: 'llm-summary-existing',
              status,
              modelVersion: 'summary-local-v1',
              promptVersion: 'proctoring-summary-v1',
            },
            conflictResolved: true,
          }),
          updateJobId: jest.fn(),
          countRecentForParticipation: jest.fn().mockResolvedValue(0),
        },
      });

      const result = await service.generate({
        examId: 'exam-1',
        participationId: 'participation-1',
        actor: { userId: 'owner-1', role: 'owner' },
      });

      expect(result).toEqual({
        llmSummaryId: 'llm-summary-existing',
        status,
        conflictResolved: true,
      });
      expect(aiJobRepository.upsertByJobKey).not.toHaveBeenCalled();
      expect(summaryRepository.updateJobId).not.toHaveBeenCalled();
      expect(auditLogRepository.create).not.toHaveBeenCalled();
    }
  );

  it('requeues an existing job key instead of failing when recomputing the same payload', async () => {
    const { service, aiJobRepository, summaryRepository } = createService({
      settingsRepository: {
        findByExamId: jest.fn().mockResolvedValue({
          llmSummaryEnabled: true,
          llmSummaryProvider: 'local',
          llmSummaryModelVersion: 'summary-local-v1',
          llmSummaryPromptVersion: 'proctoring-summary-v1',
          llmSummaryJudgeEnabled: true,
          llmSummaryMinValidationScore: '0.85',
          llmSummaryRateLimitPerParticipation: 3,
          llmSummaryRateLimitWindowHours: 24,
        }),
      },
      aiJobRepository: {
        insert: jest.fn(),
        upsertByJobKey: jest.fn().mockResolvedValue({ id: 'job-reused-1', status: 'pending' }),
      },
    });

    const result = await service.generate({
      examId: 'exam-1',
      participationId: 'participation-1',
      actor: { userId: 'owner-1', role: 'owner' },
    });

    expect(aiJobRepository.upsertByJobKey).toHaveBeenCalledWith(
      expect.objectContaining({
        jobKey:
          'proctoring-llm-summary:participation-1:' +
          `${'a'.repeat(64)}:proctoring-summary-v1:summary-local-v1`,
        attempts: 0,
        maxAttempts: 3,
        status: 'pending',
      })
    );
    expect(summaryRepository.updateJobId).toHaveBeenCalledWith('llm-summary-1', 'job-reused-1');
    expect(result).toEqual({
      llmSummaryId: 'llm-summary-1',
      status: 'pending',
      conflictResolved: false,
    });
  });
});
