import { ProctoringEvaluationService } from '../../../apps/api/src/services/proctoring/proctoring-evaluation.service';

function createService(overrides: {
  labels?: any[];
  resultsByParticipation?: Record<string, any[]>;
  predictedSessions?: number;
} = {}) {
  const resultsByParticipation = overrides.resultsByParticipation ?? {
    p1: [{ participationId: 'p1', windowId: 'w1', anomalyScore: 0.91 }],
    p2: [{ participationId: 'p2', windowId: 'w2', anomalyScore: 0.72 }],
    p3: [{ participationId: 'p3', windowId: 'w3', anomalyScore: 0.22 }],
    p4: [{ participationId: 'p4', windowId: 'w4', anomalyScore: 0.82 }],
  };
  const anomalyResultRepository = {
    findLatestByParticipation: jest.fn(async participationId => resultsByParticipation[participationId] ?? []),
    countDistinctParticipationsByExamModel: jest
      .fn()
      .mockResolvedValue(overrides.predictedSessions ?? 4),
  };
  const reviewLabelRepository = {
    findByExamId: jest.fn().mockResolvedValue(
      overrides.labels ?? [
        { participationId: 'p1', reviewOutcome: 'policy_review_required' },
        { participationId: 'p2', reviewOutcome: 'follow_up_required' },
        { participationId: 'p3', reviewOutcome: 'no_action_needed' },
        { participationId: 'p4', reviewOutcome: 'inconclusive' },
      ]
    ),
  };
  const evaluationReportRepository = {
    insert: jest.fn(async values => ({ id: 'report-1', ...values })),
  };
  const auditLogRepository = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const service = new ProctoringEvaluationService({
    anomalyResultRepository: anomalyResultRepository as any,
    reviewLabelRepository: reviewLabelRepository as any,
    evaluationReportRepository: evaluationReportRepository as any,
    auditLogRepository: auditLogRepository as any,
  });
  return { service, evaluationReportRepository, auditLogRepository };
}

describe('ProctoringEvaluationService', () => {
  it('keeps evaluation gate insufficient when pilot counts are below threshold', async () => {
    const { service, evaluationReportRepository, auditLogRepository } = createService();

    const result = await service.generateReport({
      examId: 'exam-1',
      modelVersion: 'iforest-browser-v1',
      featureSchemaVersion: 'browser-window-v1',
      scoringSchemaVersion: 'anomaly-score-v1',
      datasetSnapshotRef: 'manual-labels:exam-1:2026-06-14',
      thresholds: { high: 0.7, critical: 0.9 },
      generatedBy: 'owner-1',
    });

    expect(evaluationReportRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersion: 'iforest-browser-v1',
        sampleSize: 3,
        status: 'insufficient_sample',
        metricsJson: expect.objectContaining({
          precision: 1,
          recall: 1,
          falsePositiveRate: 0,
        }),
        confusionMatrixJson: {
          truePositive: 2,
          falsePositive: 0,
          trueNegative: 1,
          falseNegative: 0,
        },
        falsePositiveExamplesJson: [],
        falseNegativeExamplesJson: [],
      })
    );
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'proctoring_evaluation_report_generate',
        targetType: 'exam',
        targetId: 'exam-1',
      })
    );
    expect(result.id).toBe('report-1');
    expect(JSON.stringify(result)).not.toMatch(/payloadJson|rawClipboard|sourceCode/i);
  });

  it('passes evaluation gate only after enough predictions and manual labels exist', async () => {
    const labels = Array.from({ length: 10 }, (_, index) => ({
      participationId: `p${index + 1}`,
      reviewOutcome: index < 5 ? 'follow_up_required' : 'no_action_needed',
    }));
    const resultsByParticipation = Object.fromEntries(
      labels.map((label, index) => [
        label.participationId,
        [
          {
            participationId: label.participationId,
            windowId: `w${index + 1}`,
            anomalyScore: index < 5 ? 0.8 : 0.2,
          },
        ],
      ])
    );
    const { service, evaluationReportRepository } = createService({
      labels,
      resultsByParticipation,
      predictedSessions: 50,
    });

    const result = await service.generateReport({
      examId: 'exam-1',
      modelVersion: 'iforest-browser-v1',
      featureSchemaVersion: 'browser-window-v1',
      scoringSchemaVersion: 'anomaly-score-v1',
      datasetSnapshotRef: 'manual-labels:exam-1:2026-06-14',
      thresholds: { high: 0.7, critical: 0.9 },
      generatedBy: 'owner-1',
    });

    expect(evaluationReportRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleSize: 10,
        status: 'passed_gate',
        metricsJson: expect.objectContaining({
          precision: 1,
          recall: 1,
          falsePositiveRate: 0,
        }),
      })
    );
    expect(result.status).toBe('passed_gate');
  });
});
