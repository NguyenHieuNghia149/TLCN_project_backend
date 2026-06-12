import { ProctoringAiWorkerService } from '../../../apps/worker/src/services/proctoring-ai-worker.service';

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
  };
  const service = new ProctoringAiWorkerService({
    jobRepository: repository as any,
    httpClient: httpClient as any,
    workerId: 'worker-1',
    now: () => new Date('2026-06-11T10:05:00.000Z'),
    sleep: jest.fn(),
    circuitFailureThreshold: 2,
    circuitOpenMs: 60_000,
    ...(overrides as any),
  });

  return { service, repository, httpClient };
}

describe('ProctoringAiWorkerService', () => {
  it('claims a PostgreSQL job, calls server-ai from compact payload, and persists the result', async () => {
    const { service, repository, httpClient } = createService();

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
