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
});
