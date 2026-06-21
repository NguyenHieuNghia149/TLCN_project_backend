import { ProctoringThresholdService } from '../../../apps/api/src/services/proctoring/proctoring-threshold.service';

describe('ProctoringThresholdService', () => {
  it('normalizes deterministic and anomaly thresholds from settings', async () => {
    const settingsRepository = {
      findByExamId: jest.fn().mockResolvedValue({
        riskWeightsJson: { focus_change: 20 },
        riskThresholdsJson: { medium: 10, high: 40, critical: 80 },
        aiAnomalyThresholdsJson: { medium: 0.4, high: 0.7, critical: 0.9 },
      }),
    };
    const service = new ProctoringThresholdService({ settingsRepository: settingsRepository as any });

    const result = await service.loadPolicyForExam('exam-1');

    expect(result.deterministic.eventWeights).toEqual({ focus_change: 20 });
    expect(result.deterministic.riskThresholds).toEqual({ medium: 10, high: 40, critical: 80 });
    expect(result.anomalyThresholds).toEqual({ medium: 0.4, high: 0.7, critical: 0.9 });
    expect(result.scoringSchemaVersion).toBe('phase-2-threshold-policy-v1');
  });

  it.each([
    ['deterministic out of order', { riskThresholdsJson: { medium: 50, high: 40, critical: 80 } }],
    ['deterministic out of range', { riskThresholdsJson: { medium: 10, high: 40, critical: 101 } }],
    ['anomaly out of order', { aiAnomalyThresholdsJson: { medium: 0.8, high: 0.7, critical: 0.9 } }],
    ['anomaly out of range', { aiAnomalyThresholdsJson: { medium: 0.4, high: 0.7, critical: 2 } }],
  ])('rejects invalid threshold policy: %s', async (_caseName, settings) => {
    const service = new ProctoringThresholdService({
      settingsRepository: {
        findByExamId: jest.fn().mockResolvedValue(settings),
      } as any,
    });

    await expect(service.loadPolicyForExam('exam-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'PROCTORING_THRESHOLD_POLICY_INVALID',
    });
  });
});
