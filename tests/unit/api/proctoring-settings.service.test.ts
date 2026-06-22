import { ProctoringSettingsService } from '../../../apps/api/src/services/proctoring/proctoring-settings.service';

function createService(overrides: Record<string, unknown> = {}) {
  const settingsRepository = {
    findByExamId: jest.fn().mockResolvedValue(null),
    upsertForExam: jest.fn().mockImplementation(async values => ({
      id: 'settings-1',
      ...values,
    })),
  };
  const examRepository = {
    findBySlug: jest.fn(),
    findById: jest.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    }),
  };
  const modelRegistryService = {
    assertAiVisibilityGate: jest.fn().mockResolvedValue(undefined),
  };
  const auditLogRepository = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  const service = new ProctoringSettingsService({
    settingsRepository,
    examRepository,
    modelRegistryService,
    auditLogRepository,
    ...(overrides as any),
  });

  return {
    service,
    settingsRepository,
    examRepository,
    modelRegistryService,
    auditLogRepository,
  };
}

describe('ProctoringSettingsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('rejects invalid deterministic or anomaly threshold policies', async () => {
    const { service, settingsRepository } = createService();

    await expect(
      service.updateSettings(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        {
          riskThresholdsJson: { medium: 50, high: 25, critical: 85 },
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'PROCTORING_THRESHOLD_POLICY_INVALID',
    });
    expect(settingsRepository.upsertForExam).not.toHaveBeenCalled();
  });

  it('requires the AI advisory visibility gate before exposing advisory output', async () => {
    const { service, modelRegistryService, settingsRepository } = createService({
      modelRegistryService: {
        assertAiVisibilityGate: jest.fn().mockRejectedValue(
          Object.assign(new Error('gate failed'), {
            statusCode: 400,
            code: 'PROCTORING_AI_VISIBILITY_GATE_NOT_MET',
          })
        ),
      },
    });

    await expect(
      service.updateSettings(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        {
          aiAdvisoryVisible: true,
          defaultAnomalyModelVersion: 'iforest-v1',
        }
      )
    ).rejects.toMatchObject({
      code: 'PROCTORING_AI_VISIBILITY_GATE_NOT_MET',
    });
    expect(modelRegistryService.assertAiVisibilityGate).not.toHaveBeenCalled();
    expect(settingsRepository.upsertForExam).not.toHaveBeenCalled();
  });

  it('audits threshold and visibility updates after gate validation passes', async () => {
    const { service, modelRegistryService, settingsRepository, auditLogRepository } =
      createService();

    const result = await service.updateSettings(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        aiAdvisoryVisible: true,
        defaultAnomalyModelVersion: 'iforest-v1',
        aiAnomalyThresholdsJson: { medium: 0.4, high: 0.7, critical: 0.9 },
      }
    );

    expect(modelRegistryService.assertAiVisibilityGate).toHaveBeenCalledWith({
      modelVersion: 'iforest-v1',
      minimumEvaluationStatus: 'passed_gate',
    });
    expect(settingsRepository.upsertForExam).toHaveBeenCalledWith(
      expect.objectContaining({
        aiAdvisoryVisible: true,
        defaultAnomalyModelVersion: 'iforest-v1',
      })
    );
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: '22222222-2222-4222-8222-222222222222',
        action: 'proctoring_settings_ai_update',
        targetType: 'exam',
        targetId: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(result).toMatchObject({ aiAdvisoryVisible: true });
  });

  it('includes LLM summary setting keys in audited AI settings metadata', async () => {
    const { service, auditLogRepository } = createService();

    await service.updateSettings(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        llmSummaryProvider: 'disabled',
        llmSummaryModelVersion: 'summary-local-v1',
        llmSummaryPromptVersion: 'proctoring-summary-v1',
        llmSummaryJudgeEnabled: false,
        llmSummaryMinValidationScore: '0.9',
        llmSummaryRateLimitPerParticipation: 2,
        llmSummaryRateLimitWindowHours: 12,
      } as any
    );

    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'proctoring_settings_ai_update',
        metadata: expect.objectContaining({
          changedKeys: expect.arrayContaining([
            'llmSummaryProvider',
            'llmSummaryModelVersion',
            'llmSummaryPromptVersion',
            'llmSummaryJudgeEnabled',
            'llmSummaryMinValidationScore',
            'llmSummaryRateLimitPerParticipation',
            'llmSummaryRateLimitWindowHours',
          ]),
        }),
      })
    );
  });

  it('keeps LLM summary enablement blocked by the privacy gate when approval fields are missing', async () => {
    const { service, settingsRepository, auditLogRepository } = createService();

    await expect(
      service.updateSettings(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        {
          llmSummaryEnabled: true,
          llmPrivacyApprovedBy: 'some-user',
        } as any
      )
    ).rejects.toMatchObject({
      code: 'PROCTORING_LLM_PRIVACY_GATE_NOT_APPROVED',
    });

    expect(settingsRepository.upsertForExam).not.toHaveBeenCalled();
    expect(auditLogRepository.create).not.toHaveBeenCalled();
  });

  it('allows LLM summary enablement when privacy approval fields are set', async () => {
    const { service, settingsRepository } = createService();

    const result = await service.updateSettings(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        llmSummaryEnabled: true,
        llmPrivacyApprovedAt: '2026-06-20T00:00:00.000Z',
        llmPrivacyApprovedBy: 'dpo-user',
        providerDpaReference: 'dpa-2026-001',
      } as any
    );

    expect(result.llmSummaryEnabled).toBe(true);
    expect(settingsRepository.upsertForExam).toHaveBeenCalled();
  });

  it('switches legacy disabled LLM provider rows to local when summary is enabled', async () => {
    const legacySettingsRepository = {
      findByExamId: jest.fn().mockResolvedValue({
        examId: '11111111-1111-4111-8111-111111111111',
        llmSummaryEnabled: false,
        llmSummaryProvider: 'disabled',
      }),
      upsertForExam: jest.fn().mockImplementation(async values => ({
        id: 'settings-1',
        ...values,
      })),
    };
    const { service } = createService({
      settingsRepository: legacySettingsRepository,
    });

    const result = await service.updateSettings(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        llmSummaryEnabled: true,
        llmPrivacyApprovedAt: '2026-06-20T00:00:00.000Z',
        llmPrivacyApprovedBy: 'dpo-user',
        providerDpaReference: 'dpa-2026-001',
      } as any
    );

    expect(result).toMatchObject({
      llmSummaryEnabled: true,
      llmSummaryProvider: 'local',
    });
    expect(legacySettingsRepository.upsertForExam).toHaveBeenCalledWith(
      expect.objectContaining({
        llmSummaryEnabled: true,
        llmSummaryProvider: 'local',
      })
    );
  });

  it('rejects external LLM provider without providerDpaReference', async () => {
    const { service, settingsRepository } = createService();

    await expect(
      service.updateSettings(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        {
          llmSummaryEnabled: true,
          llmPrivacyApprovedAt: '2026-06-20T00:00:00.000Z',
          llmPrivacyApprovedBy: 'dpo-user',
          llmSummaryProvider: 'external',
          providerDpaReference: null,
        } as any
      )
    ).rejects.toMatchObject({
      code: 'PROCTORING_LLM_PROVIDER_DPA_MISSING',
    });

    expect(settingsRepository.upsertForExam).not.toHaveBeenCalled();
  });
});
