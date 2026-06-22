import { ProctoringAiWorkerService } from '../../../apps/worker/src/services/proctoring-ai-worker.service';
import { ProctoringAiResultWriterService } from '../../../apps/worker/src/services/proctoring-ai-result-writer.service';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    jobKey: 'job-key-1',
    examId: 'exam-1',
    participationId: 'participation-1',
    sessionId: 'session-1',
    windowStart: new Date('2026-06-11T10:00:00.000Z'),
    windowEnd: new Date('2026-06-11T10:05:00.000Z'),
    status: 'running',
    priority: 0,
    payloadJson: {
      schemaVersion: 1,
      windowId: 'window-1',
      examId: 'exam-1',
      participationId: 'participation-1',
      candidateUserId: 'candidate-1',
      consentRecordId: 'consent-1',
      startedAt: '2026-06-11T10:00:00.000Z',
      endedAt: '2026-06-11T10:05:00.000Z',
      features: { totalEvents: 1 },
      context: { eventCounts: { focus_change: 1 } },
    },
    payloadSchemaVersion: 'phase-1-ai-window-v1',
    attempts: 1,
    maxAttempts: 3,
    nextRunAt: new Date('2026-06-11T10:00:00.000Z'),
    lockedBy: 'worker-1',
    lockedAt: new Date('2026-06-11T10:00:00.000Z'),
    lastError: null,
    resultJson: null,
    resultModelVersion: null,
    createdAt: new Date('2026-06-11T10:00:00.000Z'),
    updatedAt: new Date('2026-06-11T10:00:00.000Z'),
    completedAt: null,
    ...overrides,
  };
}

function createService(overrides: Record<string, unknown> = {}) {
  const repository = {
    claimNext: jest.fn().mockResolvedValue(job()),
    updateStatus: jest.fn().mockResolvedValue(job({ status: 'completed' })),
    upsertByJobKey: jest.fn().mockImplementation(async values => values),
  };
  const resultWriter = {
    persistPrediction: jest.fn().mockResolvedValue({
      id: 'result-1',
      windowId: 'window-1',
      modelVersion: 'iforest-v1',
    }),
    persistExplanation: jest.fn().mockResolvedValue({
      id: 'result-1',
      windowId: 'window-1',
      modelVersion: 'iforest-v1',
      explanationStatus: 'completed',
    }),
    markExplanationFailed: jest.fn().mockResolvedValue({
      id: 'result-1',
      explanationStatus: 'failed',
    }),
    markSummaryFailed: jest.fn().mockResolvedValue({
      id: 'llm-summary-1',
      status: 'dead_letter',
      validationStatus: 'failed',
    }),
    persistSummary: jest.fn().mockResolvedValue({
      id: 'llm-summary-1',
      status: 'accepted',
    }),
  };
  const httpClient = {
    predict: jest.fn().mockResolvedValue({
      windowId: 'window-1',
      examId: 'exam-1',
      participationId: 'participation-1',
      modelVersion: 'iforest-v1',
      anomalyScore: 0.24,
      rawScore: 1.2,
      riskLevel: 'low',
    }),
    explain: jest.fn().mockResolvedValue({
      windowId: 'window-1',
      examId: 'exam-1',
      participationId: 'participation-1',
      modelVersion: 'iforest-v1',
      anomalyScore: 0.91,
      riskLevel: 'critical',
      explanationStatus: 'completed',
      topContributors: [
        {
          featureName: 'visibilityHiddenMs',
          numericValue: 120000,
          contribution: 120000,
          direction: 'increased_risk',
          displayLabel: 'Page hidden duration',
        },
      ],
    }),
    generateSummary: jest.fn().mockResolvedValue({
      summaryText: 'He thong ghi nhan 1 su kien.',
      riskFacts: [],
      citations: [{ eventId: 'event-1', reason: 'timeline evidence' }],
      missingDataNotes: [],
      modelNotes: [],
      guardRailWarnings: [],
      validationStatus: 'passed',
      validationScore: 0.92,
      validationErrors: [],
      modelVersion: 'summary-local-v1',
      promptVersion: 'proctoring-summary-v1',
      outputSchemaVersion: 'proctoring-summary-output-v1',
    }),
  };
  const service = new ProctoringAiWorkerService({
    jobRepository: repository as any,
    resultWriter: resultWriter as any,
    httpClient: httpClient as any,
    workerId: 'worker-1',
    now: () => new Date('2026-06-11T10:05:00.000Z'),
    sleep: jest.fn(),
    circuitFailureThreshold: 2,
    circuitOpenMs: 60_000,
    ...(overrides as any),
  });

  return { service, repository, resultWriter, httpClient };
}

describe('ProctoringAiWorkerService', () => {
  it('claims a PostgreSQL job, calls server-ai from compact payload, and persists the result', async () => {
    const { service, repository, resultWriter, httpClient } = createService();

    const result = await service.processNext();

    expect(result).toEqual({ status: 'completed', jobId: 'job-1' });
    expect(repository.claimNext).toHaveBeenCalledWith({
      workerId: 'worker-1',
      now: new Date('2026-06-11T10:05:00.000Z'),
    });
    expect(httpClient.predict).toHaveBeenCalledWith(
      expect.objectContaining({
        windowId: 'window-1',
        features: { totalEvents: 1 },
      })
    );
    expect(repository.updateStatus).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: 'completed',
        resultModelVersion: 'iforest-v1',
        completedAt: new Date('2026-06-11T10:05:00.000Z'),
      })
    );
    expect(resultWriter.persistPrediction).toHaveBeenCalledWith({
      job: expect.objectContaining({
        id: 'job-1',
        examId: 'exam-1',
        participationId: 'participation-1',
      }),
      prediction: expect.objectContaining({
        windowId: 'window-1',
        modelVersion: 'iforest-v1',
        anomalyScore: 0.24,
      }),
      completedAt: new Date('2026-06-11T10:05:00.000Z'),
    });
  });

  it('retries with exponential backoff before dead-lettering exhausted jobs', async () => {
    const { service, repository } = createService({
      httpClient: {
        predict: jest.fn().mockRejectedValue(new Error('server-ai unavailable')),
      },
    });

    await expect(service.processNext()).resolves.toEqual({ status: 'retry', jobId: 'job-1' });
    expect(repository.updateStatus).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        status: 'retry',
        lastError: 'server-ai unavailable',
        nextRunAt: new Date('2026-06-11T10:05:02.000Z'),
      })
    );

    repository.claimNext.mockResolvedValueOnce(job({ attempts: 3, maxAttempts: 3 }));
    await expect(service.processNext()).resolves.toEqual({
      status: 'dead_letter',
      jobId: 'job-1',
    });
    expect(repository.updateStatus).toHaveBeenLastCalledWith(
      'job-1',
      expect.objectContaining({
        status: 'dead_letter',
        lastError: 'server-ai unavailable',
      })
    );
  });

  it('processes explanation jobs without rerunning prediction', async () => {
    const { service, repository, resultWriter, httpClient } = createService();
    repository.claimNext.mockResolvedValueOnce(
      job({
        jobType: 'anomaly_explanation',
        parentJobId: 'prediction-job-1',
        payloadJson: {
          telemetry: {
            schemaVersion: 1,
            windowId: 'window-1',
            examId: 'exam-1',
            participationId: 'participation-1',
            candidateUserId: 'candidate-1',
            consentRecordId: 'consent-1',
            startedAt: '2026-06-11T10:00:00.000Z',
            endedAt: '2026-06-11T10:05:00.000Z',
            features: { visibilityHiddenMs: 120000 },
            context: {},
          },
          modelVersion: 'iforest-v1',
          anomalyScore: 0.91,
          riskLevel: 'critical',
        },
      })
    );

    await expect(service.processNext()).resolves.toEqual({ status: 'completed', jobId: 'job-1' });

    expect(httpClient.predict).not.toHaveBeenCalled();
    expect(httpClient.explain).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersion: 'iforest-v1',
        anomalyScore: 0.91,
        riskLevel: 'critical',
      })
    );
    expect(resultWriter.persistExplanation).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'job-1', jobType: 'anomaly_explanation' }),
      explanation: expect.objectContaining({
        explanationStatus: 'completed',
        topContributors: expect.any(Array),
      }),
      completedAt: new Date('2026-06-11T10:05:00.000Z'),
    });
  });

  it('processes LLM summary jobs without rerunning anomaly prediction', async () => {
    const { service, repository, resultWriter, httpClient } = createService();
    repository.claimNext.mockResolvedValueOnce(
      job({
        jobType: 'llm_summary_generation',
        payloadSchemaVersion: 'proctoring-summary-input-v1',
        payloadJson: {
          schemaVersion: 'proctoring-summary-input-v1',
          llmSummaryId: 'llm-summary-1',
          inputHash: 'a'.repeat(64),
          timeline: [{ eventId: 'event-1' }],
          riskFacts: [],
          anomalyFacts: [],
          reviewFacts: {},
          missingDataNotes: [],
        },
      })
    );

    await expect(service.processNext()).resolves.toEqual({ status: 'completed', jobId: 'job-1' });

    expect(httpClient.predict).not.toHaveBeenCalled();
    expect(httpClient.generateSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        llmSummaryId: 'llm-summary-1',
        timeline: [{ eventId: 'event-1' }],
      })
    );
    expect(resultWriter.persistSummary).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'job-1', jobType: 'llm_summary_generation' }),
      summary: expect.objectContaining({
        validationStatus: 'passed',
        summaryText: 'He thong ghi nhan 1 su kien.',
      }),
      completedAt: new Date('2026-06-11T10:05:00.000Z'),
    });
    expect(JSON.stringify(repository.updateStatus.mock.calls.at(-1)![1].resultJson)).not.toMatch(
      /rawProviderResponse|rawPrompt/
    );
  });

  it('marks exhausted explanation jobs as failed on the anomaly result', async () => {
    const { service, repository, resultWriter } = createService({
      httpClient: {
        predict: jest.fn(),
        explain: jest.fn().mockRejectedValue(new Error('explanation unavailable')),
      },
    });
    repository.claimNext.mockResolvedValueOnce(
      job({
        jobType: 'anomaly_explanation',
        attempts: 3,
        maxAttempts: 3,
        payloadJson: {
          telemetry: {
            windowId: 'window-1',
          },
          modelVersion: 'iforest-v1',
        },
      })
    );

    await expect(service.processNext()).resolves.toEqual({
      status: 'dead_letter',
      jobId: 'job-1',
    });

    expect(resultWriter.markExplanationFailed).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'job-1', jobType: 'anomaly_explanation' }),
      reason: 'explanation unavailable',
    });
  });

  it('marks exhausted LLM summary jobs as dead-letter without storing raw provider output', async () => {
    const { service, repository, resultWriter } = createService({
      httpClient: {
        predict: jest.fn(),
        explain: jest.fn(),
        generateSummary: jest
          .fn()
          .mockRejectedValue(new Error('provider unavailable: raw response secret')),
      },
    });
    repository.claimNext.mockResolvedValueOnce(
      job({
        jobType: 'llm_summary_generation',
        attempts: 3,
        maxAttempts: 3,
        payloadSchemaVersion: 'proctoring-summary-input-v1',
        payloadJson: {
          schemaVersion: 'proctoring-summary-input-v1',
          llmSummaryId: 'llm-summary-1',
          inputHash: 'a'.repeat(64),
          timeline: [],
          riskFacts: [],
          anomalyFacts: [],
          reviewFacts: {},
          missingDataNotes: [],
        },
      })
    );

    await expect(service.processNext()).resolves.toEqual({
      status: 'dead_letter',
      jobId: 'job-1',
    });

    expect(resultWriter.markSummaryFailed).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 'job-1', jobType: 'llm_summary_generation' }),
      reason: 'provider unavailable: raw response secret',
      status: 'dead_letter',
    });
    expect(JSON.stringify(repository.updateStatus.mock.calls)).not.toMatch(/raw response secret/i);
  });

  it('enqueues explanation job only for high and critical prediction results', async () => {
    const { service, repository } = createService({
      httpClient: {
        predict: jest.fn().mockResolvedValue({
          windowId: 'window-1',
          examId: 'exam-1',
          participationId: 'participation-1',
          modelVersion: 'iforest-v1',
          anomalyScore: 0.91,
          rawScore: 2.4,
          riskLevel: 'critical',
        }),
        explain: jest.fn(),
      },
    });

    await expect(service.processNext()).resolves.toEqual({ status: 'completed', jobId: 'job-1' });

    expect(repository.upsertByJobKey).toHaveBeenCalledWith(
      expect.objectContaining({
        jobKey: 'anomaly-explanation:participation-1:window-1:iforest-v1',
        jobType: 'anomaly_explanation',
        parentJobId: 'job-1',
        modelVersion: 'iforest-v1',
        payloadJson: expect.objectContaining({
          modelVersion: 'iforest-v1',
          anomalyScore: 0.91,
          riskLevel: 'critical',
        }),
      })
    );
  });

  it('opens a circuit after repeated server-ai failures and skips claims while open', async () => {
    const { service, repository } = createService({
      httpClient: {
        predict: jest.fn().mockRejectedValue(new Error('server-ai unavailable')),
      },
    });

    await service.processNext();
    await service.processNext();
    repository.claimNext.mockClear();

    await expect(service.processNext()).resolves.toEqual({
      status: 'circuit_open',
      jobId: undefined,
    });
    expect(repository.claimNext).not.toHaveBeenCalled();
  });
});

describe('ProctoringAiResultWriterService', () => {
  it('marks LLM summary failures with safe validation errors only', async () => {
    const llmSummaryRepository = {
      updateStatus: jest.fn().mockResolvedValue({
        id: 'llm-summary-1',
        status: 'dead_letter',
        validationStatus: 'failed',
      }),
    };
    const writer = new ProctoringAiResultWriterService({
      anomalyResultRepository: {
        upsertByWindowModel: jest.fn(),
        updateExplanationStatus: jest.fn(),
        resolveStaleExplanations: jest.fn(),
      } as any,
      llmSummaryRepository,
    });

    await writer.markSummaryFailed({
      job: job({
        jobType: 'llm_summary_generation',
        payloadJson: {
          llmSummaryId: 'llm-summary-1',
          raw_provider_response: 'must not persist',
        },
      }) as any,
      reason: 'provider unavailable: raw response secret',
      status: 'dead_letter',
    });

    expect(llmSummaryRepository.updateStatus).toHaveBeenCalledWith(
      'llm-summary-1',
      expect.objectContaining({
        status: 'dead_letter',
        validationStatus: 'failed',
        validationErrorsJson: ['provider_failed'],
        summaryJson: null,
        riskFactsJson: null,
        modelNotesJson: null,
        sourceEventIdsJson: [],
      })
    );
    expect(JSON.stringify(llmSummaryRepository.updateStatus.mock.calls)).not.toMatch(
      /raw response secret|must not persist/i
    );
  });

  it.each([
    ['request aborted', 'aborted'],
    ['axios timeout', 'timeout of 5000ms exceeded'],
    ['socket hang up', 'socket hang up'],
  ])('maps %s to a safe typed summary failure code', async (_caseName, reason) => {
    const llmSummaryRepository = {
      updateStatus: jest.fn().mockResolvedValue({
        id: 'llm-summary-1',
        status: 'dead_letter',
        validationStatus: 'failed',
      }),
    };
    const writer = new ProctoringAiResultWriterService({
      anomalyResultRepository: {
        upsertByWindowModel: jest.fn(),
        updateExplanationStatus: jest.fn(),
        resolveStaleExplanations: jest.fn(),
      } as any,
      llmSummaryRepository,
    });

    await writer.markSummaryFailed({
      job: job({
        jobType: 'llm_summary_generation',
        payloadJson: {
          llmSummaryId: 'llm-summary-1',
        },
      }) as any,
      reason,
      status: 'dead_letter',
    });

    expect(llmSummaryRepository.updateStatus).toHaveBeenCalledWith(
      'llm-summary-1',
      expect.objectContaining({
        validationErrorsJson: [
          reason === 'socket hang up' ? 'provider_failed' : 'provider_timeout',
        ],
      })
    );
  });

  it('resolves stale pending explanations to failed via resolveStaleExplanations', async () => {
    const anomalyResultRepository = {
      upsertByWindowModel: jest.fn(),
      updateExplanationStatus: jest.fn(),
      resolveStaleExplanations: jest.fn().mockResolvedValue(3),
    };
    const writer = new ProctoringAiResultWriterService({
      anomalyResultRepository,
      llmSummaryRepository: { updateStatus: jest.fn() },
    });

    const count = await writer.resolveStaleExplanations(3600000);

    expect(count).toBe(3);
    expect(anomalyResultRepository.resolveStaleExplanations).toHaveBeenCalledWith(3600000, undefined);
  });

  it('periodically resolves stale pending explanations during process loop', async () => {
    const jobRepository = {
      claimNext: jest.fn().mockResolvedValue(null),
      upsertByJobKey: jest.fn(),
      updateStatus: jest.fn(),
    };
    const resolveStaleExplanations = jest.fn().mockResolvedValue(0);
    const worker = new ProctoringAiWorkerService({
      jobRepository: jobRepository as any,
      httpClient: { predict: jest.fn(), explain: jest.fn(), generateSummary: jest.fn() },
      resultWriter: {
        persistPrediction: jest.fn(),
        persistExplanation: jest.fn(),
        markExplanationFailed: jest.fn(),
        persistSummary: jest.fn(),
        markSummaryFailed: jest.fn(),
        resolveStaleExplanations,
      },
      pollIntervalMs: 100,
    });

    // Run enough cycles to trigger cleanup (every 12 cycles)
    for (let i = 0; i < 24; i++) {
      await worker.processNext();
    }

    expect(resolveStaleExplanations).toHaveBeenCalled();
  });
});
