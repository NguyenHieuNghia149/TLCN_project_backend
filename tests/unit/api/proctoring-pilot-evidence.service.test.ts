import {
  ProctoringPilotEvidenceService,
  formatPilotEvidenceReport,
} from '../../../apps/api/src/services/proctoring/proctoring-pilot-evidence.service';

function createService(overrides: {
  predictedSessions?: number;
  labels?: any[];
  latestReport?: any | null;
} = {}) {
  const anomalyResultRepository = {
    countDistinctParticipationsByExamModel: jest
      .fn()
      .mockResolvedValue(overrides.predictedSessions ?? 49),
  };
  const reviewLabelRepository = {
    findByExamId: jest.fn().mockResolvedValue(
      overrides.labels ??
        Array.from({ length: 9 }, (_, index) => ({
          participationId: `participation-${index + 1}`,
          reviewOutcome: 'no_action_needed',
        }))
    ),
  };
  const evaluationReportRepository = {
    findLatestForExamModel: jest.fn().mockResolvedValue(overrides.latestReport ?? null),
  };

  const service = new ProctoringPilotEvidenceService({
    anomalyResultRepository: anomalyResultRepository as any,
    reviewLabelRepository: reviewLabelRepository as any,
    evaluationReportRepository: evaluationReportRepository as any,
  });

  return {
    service,
    anomalyResultRepository,
    reviewLabelRepository,
    evaluationReportRepository,
  };
}

describe('ProctoringPilotEvidenceService', () => {
  it('blocks AI advisory when prediction and manual-label sample counts are below gate', async () => {
    const { service } = createService();

    const evidence = await service.collect({
      examId: 'exam-1',
      modelVersion: 'iforest-browser-v1',
    });

    expect(evidence).toEqual({
      examId: 'exam-1',
      modelVersion: 'iforest-browser-v1',
      predictionSessions: {
        actual: 49,
        required: 50,
        passed: false,
      },
      manualReviewLabels: {
        actual: 9,
        required: 10,
        passed: false,
      },
      latestEvaluationReport: null,
      readyForAiAdvisory: false,
      blockers: [
        'prediction_sessions_below_minimum',
        'manual_review_labels_below_minimum',
        'missing_passed_evaluation_report',
      ],
    });
  });

  it('allows AI advisory consideration only after sample counts and evaluation report pass', async () => {
    const { service } = createService({
      predictedSessions: 50,
      labels: Array.from({ length: 10 }, (_, index) => ({
        participationId: `participation-${index + 1}`,
        reviewOutcome: index % 2 === 0 ? 'follow_up_required' : 'no_action_needed',
      })),
      latestReport: {
        id: 'report-1',
        status: 'passed_gate',
        sampleSize: 10,
        generatedAt: new Date('2026-06-14T10:00:00.000Z'),
      },
    });

    const evidence = await service.collect({
      examId: 'exam-1',
      modelVersion: 'iforest-browser-v1',
    });

    expect(evidence.readyForAiAdvisory).toBe(true);
    expect(evidence.blockers).toEqual([]);
    expect(evidence.latestEvaluationReport).toEqual({
      id: 'report-1',
      status: 'passed_gate',
      sampleSize: 10,
      generatedAt: '2026-06-14T10:00:00.000Z',
    });
  });

  it('formats a red/green command-line report without raw telemetry fields', async () => {
    const { service } = createService({
      predictedSessions: 50,
      labels: Array.from({ length: 10 }, (_, index) => ({
        participationId: `participation-${index + 1}`,
        reviewOutcome: 'no_action_needed',
      })),
      latestReport: {
        id: 'report-1',
        status: 'passed_gate',
        sampleSize: 10,
        generatedAt: new Date('2026-06-14T10:00:00.000Z'),
      },
    });

    const report = formatPilotEvidenceReport(
      await service.collect({
        examId: 'exam-1',
        modelVersion: 'iforest-browser-v1',
      })
    );

    expect(report).toContain('READY_FOR_AI_ADVISORY=true');
    expect(report).toContain('predictionSessions=50/50');
    expect(report).toContain('manualReviewLabels=10/10');
    expect(report).toContain('latestEvaluationReport=passed_gate');
    expect(report).not.toMatch(/payloadJson|rawClipboard|sourceCode|rawPrompt/i);
  });
});
