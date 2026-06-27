const axiosPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: axiosPost,
  },
}));

import { ProctoringAiHttpClient } from '../../../apps/worker/src/services/proctoring-ai-http-client';

describe('ProctoringAiHttpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SERVER_AI_URL;
  });

  it('defaults to the compose server-ai hostname when no URL is configured', async () => {
    axiosPost.mockResolvedValue({
      data: {
        windowId: 'window-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        modelVersion: 'iforest-v1',
        anomalyScore: 0.42,
        rawScore: 1.2,
        riskLevel: 'medium',
      },
    });
    const client = new ProctoringAiHttpClient();

    await client.predict({ windowId: 'window-1' } as any);

    expect(axiosPost).toHaveBeenCalledWith(
      'http://server-ai:8001/anomaly/predict',
      { windowId: 'window-1' },
      {
        timeout: 5000,
        headers: undefined,
      }
    );
  });

  it('posts telemetry windows with optional service auth header', async () => {
    axiosPost.mockResolvedValue({
      data: {
        windowId: 'window-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        modelVersion: 'iforest-v1',
        anomalyScore: 0.42,
        rawScore: 1.2,
        riskLevel: 'medium',
        explanationStatus: 'not_requested',
        topContributors: [],
      },
    });
    const client = new ProctoringAiHttpClient({
      serverAiUrl: 'http://server-ai:8001/',
      internalToken: 'secret-token',
    });

    const result = await client.predict({ windowId: 'window-1' } as any);

    expect(axiosPost).toHaveBeenCalledWith(
      'http://server-ai:8001/anomaly/predict',
      { windowId: 'window-1' },
      {
        timeout: 5000,
        headers: {
          Authorization: 'Bearer secret-token',
        },
      }
    );
    expect(result.riskLevel).toBe('medium');
  });

  it.each([
    ['missing model version', { modelVersion: '' }],
    ['score below range', { anomalyScore: -0.1 }],
    ['score above range', { anomalyScore: 1.1 }],
    ['invalid risk level', { riskLevel: 'severe' }],
  ])('rejects invalid server-ai responses: %s', async (_caseName, patch) => {
    axiosPost.mockResolvedValue({
      data: {
        windowId: 'window-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        modelVersion: 'iforest-v1',
        anomalyScore: 0.42,
        rawScore: 1.2,
        riskLevel: 'medium',
        ...patch,
      },
    });
    const client = new ProctoringAiHttpClient({ serverAiUrl: 'http://server-ai:8001' });

    await expect(client.predict({ windowId: 'window-1' } as any)).rejects.toThrow(
      'Invalid proctoring AI response'
    );
  });

  it('posts high-risk windows to the explanation endpoint with service auth', async () => {
    axiosPost.mockResolvedValue({
      data: {
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
            rawClipboardText: 'drop me',
          },
        ],
      },
    });
    const client = new ProctoringAiHttpClient({
      serverAiUrl: 'http://server-ai:8001/',
      internalToken: 'secret-token',
    });

    const result = await client.explain({
      telemetry: { windowId: 'window-1' } as any,
      modelVersion: 'iforest-v1',
      anomalyScore: 0.91,
      riskLevel: 'critical',
    });

    expect(axiosPost).toHaveBeenCalledWith(
      'http://server-ai:8001/anomaly/explain',
      {
        telemetry: { windowId: 'window-1' },
        modelVersion: 'iforest-v1',
        anomalyScore: 0.91,
        riskLevel: 'critical',
      },
      {
        timeout: 5000,
        headers: {
          Authorization: 'Bearer secret-token',
        },
      }
    );
    expect(result.topContributors).toEqual([
      {
        featureName: 'visibilityHiddenMs',
        numericValue: 120000,
        contribution: 120000,
        direction: 'increased_risk',
        displayLabel: 'Page hidden duration',
      },
    ]);
  });

  it('posts sanitized LLM summary payload to the summary endpoint', async () => {
    axiosPost.mockResolvedValue({
      data: {
        summaryText: 'He thong ghi nhan 1 su kien.',
        riskFacts: [],
        citations: [{ eventId: 'event-1', reason: 'timeline evidence' }],
        missingDataNotes: [],
        modelNotes: [],
        guardRailWarnings: [],
        validationStatus: 'passed',
        validationScore: 0.93,
        validationErrors: [],
        modelVersion: 'summary-local-v1',
        promptVersion: 'proctoring-summary-v1',
        outputSchemaVersion: 'proctoring-summary-output-v1',
      },
    });
    const client = new ProctoringAiHttpClient({
      serverAiUrl: 'http://server-ai:8001/',
      internalToken: 'secret-token',
    });

    const result = await client.generateSummary({
      schemaVersion: 'proctoring-summary-input-v1',
      llmSummaryId: 'llm-summary-1',
      timeline: [{ eventId: 'event-1' }],
    } as any);

    expect(axiosPost).toHaveBeenCalledWith(
      'http://server-ai:8001/summary/generate',
      {
        schemaVersion: 'proctoring-summary-input-v1',
        llmSummaryId: 'llm-summary-1',
        timeline: [{ eventId: 'event-1' }],
      },
      {
        timeout: 30000,
        headers: {
          Authorization: 'Bearer secret-token',
        },
      }
    );
    expect(result.validationStatus).toBe('passed');
  });

  it('allows overriding summary timeout separately from anomaly timeout', async () => {
    axiosPost.mockResolvedValue({
      data: {
        summaryText: '',
        riskFacts: [],
        citations: [],
        missingDataNotes: [],
        modelNotes: [],
        guardRailWarnings: [],
        validationStatus: 'failed',
        validationErrors: ['non_json_output'],
        modelVersion: 'summary-local-v1',
        promptVersion: 'proctoring-summary-v1',
        outputSchemaVersion: 'proctoring-summary-output-v1',
      },
    });
    const client = new ProctoringAiHttpClient({
      serverAiUrl: 'http://server-ai:8001/',
      internalToken: 'secret-token',
      timeoutMs: 4000,
      summaryTimeoutMs: 45000,
    });

    await client.generateSummary({
      schemaVersion: 'proctoring-summary-input-v1',
      examId: 'exam-1',
      participationId: 'participation-1',
      llmSummaryId: 'llm-summary-1',
      timeline: [],
      riskFacts: [],
      anomalyFacts: [],
      reviewFacts: {},
      missingDataNotes: [],
      modelVersion: 'summary-local-v1',
      promptVersion: 'proctoring-summary-v1',
      minValidationScore: 0.85,
      provider: 'local',
    } as any);

    expect(axiosPost).toHaveBeenLastCalledWith(
      'http://server-ai:8001/summary/generate',
      expect.any(Object),
      {
        timeout: 45000,
        headers: {
          Authorization: 'Bearer secret-token',
        },
      }
    );
  });

  it('posts summary translation requests to the translation endpoint', async () => {
    axiosPost.mockResolvedValue({
      data: {
        translatedText: 'Ban dich tieng Viet.',
        targetLanguage: 'vi',
      },
    });
    const client = new ProctoringAiHttpClient({
      serverAiUrl: 'http://server-ai:8001/',
      internalToken: 'secret-token',
    });

    const result = await client.translateSummary({
      text: 'Review these signals: focus lost x2.',
      targetLanguage: 'vi',
    });

    expect(axiosPost).toHaveBeenCalledWith(
      'http://server-ai:8001/summary/translate',
      {
        text: 'Review these signals: focus lost x2.',
        targetLanguage: 'vi',
      },
      {
        timeout: 30000,
        headers: {
          Authorization: 'Bearer secret-token',
        },
      }
    );
    expect(result).toEqual({
      translatedText: 'Ban dich tieng Viet.',
      targetLanguage: 'vi',
    });
  });
});
