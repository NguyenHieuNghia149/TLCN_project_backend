import { ProctoringAiJobService } from '../../../apps/api/src/services/proctoring/proctoring-ai-job.service';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    examId: 'exam-1',
    participationId: 'participation-1',
    sessionId: 'session-1',
    candidateUserId: 'candidate-1',
    clientSessionId: 'client-1',
    clientSeq: 1,
    type: 'focus_change',
    severity: 'warning',
    schemaVersion: 1,
    payloadJson: {},
    capturedAt: new Date('2026-06-11T10:03:30.000Z'),
    receivedAt: new Date('2026-06-11T10:03:31.000Z'),
    persistedAt: new Date('2026-06-11T10:03:32.000Z'),
    buffered: true,
    entrySessionId: null,
    finalFlushReceiptId: null,
    ...overrides,
  };
}

function createService(overrides: Record<string, unknown> = {}) {
  const settingsRepository = {
    findByExamId: jest.fn().mockResolvedValue({
      enabled: true,
      aiAnomalyEnabled: true,
      aiShadowMode: true,
      aiJobWindowSeconds: 300,
    }),
  };
  const consentRepository = {
    findLatestAcceptedForCandidate: jest.fn().mockResolvedValue({
      id: 'consent-1',
      status: 'accepted',
    }),
  };
  const aiJobRepository = {
    upsertByJobKey: jest.fn().mockImplementation(async values => values),
  };
  const service = new ProctoringAiJobService({
    settingsRepository: settingsRepository as any,
    consentRepository: consentRepository as any,
    aiJobRepository: aiJobRepository as any,
    globalAiEnabled: true,
    globalShadowMode: true,
    ...(overrides as any),
  });

  return { service, settingsRepository, consentRepository, aiJobRepository };
}

describe('ProctoringAiJobService', () => {
  it.each([
    ['global AI disabled', { globalAiEnabled: false }],
    [
      'exam AI disabled',
      {
        settingsRepository: {
          findByExamId: jest.fn().mockResolvedValue({
            enabled: true,
            aiAnomalyEnabled: false,
            aiShadowMode: true,
            aiJobWindowSeconds: 300,
          }),
        },
      },
    ],
    [
      'consent missing',
      {
        consentRepository: {
          findLatestAcceptedForCandidate: jest.fn().mockResolvedValue(null),
        },
      },
    ],
  ])('does not create a job when %s', async (_caseName, overrides) => {
    const { service, aiJobRepository } = createService(overrides);

    const result = await service.enqueueTelemetryWindow({
      events: [event()],
      now: new Date('2026-06-11T10:04:00.000Z'),
    });

    expect(result).toBeNull();
    expect(aiJobRepository.upsertByJobKey).not.toHaveBeenCalled();
  });

  it('creates deterministic compact rolling-window and final-submit jobs', async () => {
    const { service, aiJobRepository } = createService();
    const events = [
      event({ id: 'e1', type: 'focus_change', clientSeq: 1 }),
      event({
        id: 'e2',
        type: 'clipboard_event',
        clientSeq: 2,
        capturedAt: new Date('2026-06-11T10:04:30.000Z'),
      }),
    ];

    const rolling = await service.enqueueTelemetryWindow({
      events: events as any,
      now: new Date('2026-06-11T10:05:00.000Z'),
    });
    const final = await service.enqueueFinalSubmitWindow({
      events: events as any,
      submitAttemptId: 'submit-1',
      now: new Date('2026-06-11T10:06:00.000Z'),
    });

    expect(rolling?.jobKey).toBe(
      'proctoring-ai:rolling:participation-1:2026-06-11T09:59:30.000Z:2026-06-11T10:04:30.000Z'
    );
    expect(final?.jobKey).toBe('proctoring-ai:final:participation-1:submit-1');
    expect(aiJobRepository.upsertByJobKey).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'pending',
        payloadSchemaVersion: 'phase-1-ai-window-v1',
        payloadJson: expect.objectContaining({
          schemaVersion: 1,
          windowId:
            'proctoring-ai:rolling:participation-1:2026-06-11T09:59:30.000Z:2026-06-11T10:04:30.000Z',
          features: expect.objectContaining({
            totalEvents: 2,
            warningEvents: 2,
            eventRatePerMinute: 0.4,
          }),
          context: expect.objectContaining({
            eventCounts: { focus_change: 1, clipboard_event: 1 },
          }),
        }),
      })
    );
    expect(
      JSON.stringify(aiJobRepository.upsertByJobKey.mock.calls[0]![0].payloadJson)
    ).not.toContain('payloadJson');
  });

  it('creates manual AI recompute jobs with selected model metadata', async () => {
    const { service, aiJobRepository } = createService();
    const events = [
      event({ id: 'e1', type: 'focus_change', clientSeq: 1 }),
      event({
        id: 'e2',
        type: 'visibility_change',
        clientSeq: 2,
        capturedAt: new Date('2026-06-11T10:05:00.000Z'),
      }),
    ];

    const result = await service.enqueueManualRecomputeWindow({
      events: events as any,
      modelVersion: 'iforest-v1',
      reason: 'manual audit',
      now: new Date('2026-06-11T10:06:00.000Z'),
    });

    expect(result?.jobKey).toBe(
      'proctoring-ai:recompute:participation-1:iforest-v1:2026-06-11T10:06:00.000Z'
    );
    expect(aiJobRepository.upsertByJobKey).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'anomaly_recompute',
        modelVersion: 'iforest-v1',
        priority: 20,
        payloadJson: expect.objectContaining({
          context: expect.objectContaining({
            selectedModelVersion: 'iforest-v1',
            recomputeReason: 'manual audit',
          }),
        }),
      })
    );
  });
});
