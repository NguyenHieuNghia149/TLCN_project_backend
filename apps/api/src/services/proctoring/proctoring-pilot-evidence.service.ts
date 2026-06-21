import { ProctoringEvaluationReportRepository } from '@backend/api/repositories/proctoring/proctoringEvaluationReport.repository';
import { ProctoringReviewLabelRepository } from '@backend/api/repositories/proctoring/proctoringReviewLabel.repository';
import { ProctoringAnomalyResultRepository } from '@backend/shared/db/repositories/proctoringAnomalyResult.repository';

const MIN_PILOT_PREDICTION_SESSIONS = 50;
const MIN_PILOT_LABEL_SESSIONS = 10;

type PilotEvidenceDependencies = {
  anomalyResultRepository?: Pick<
    ProctoringAnomalyResultRepository,
    'countDistinctParticipationsByExamModel'
  >;
  reviewLabelRepository?: Pick<ProctoringReviewLabelRepository, 'findByExamId'>;
  evaluationReportRepository?: Pick<
    ProctoringEvaluationReportRepository,
    'findLatestForExamModel'
  >;
};

type CollectPilotEvidenceInput = {
  examId: string;
  modelVersion: string;
};

type PilotGateCount = {
  actual: number;
  required: number;
  passed: boolean;
};

type PilotEvidenceReportSummary = {
  id: string;
  status: string;
  sampleSize: number;
  generatedAt: string | null;
};

export type ProctoringPilotEvidence = {
  examId: string;
  modelVersion: string;
  predictionSessions: PilotGateCount;
  manualReviewLabels: PilotGateCount;
  latestEvaluationReport: PilotEvidenceReportSummary | null;
  readyForAiAdvisory: boolean;
  blockers: string[];
};

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : null;
}

export class ProctoringPilotEvidenceService {
  private readonly anomalyResultRepository: Pick<
    ProctoringAnomalyResultRepository,
    'countDistinctParticipationsByExamModel'
  >;
  private readonly reviewLabelRepository: Pick<ProctoringReviewLabelRepository, 'findByExamId'>;
  private readonly evaluationReportRepository: Pick<
    ProctoringEvaluationReportRepository,
    'findLatestForExamModel'
  >;

  constructor(deps: PilotEvidenceDependencies = {}) {
    this.anomalyResultRepository =
      deps.anomalyResultRepository ?? new ProctoringAnomalyResultRepository();
    this.reviewLabelRepository = deps.reviewLabelRepository ?? new ProctoringReviewLabelRepository();
    this.evaluationReportRepository =
      deps.evaluationReportRepository ?? new ProctoringEvaluationReportRepository();
  }

  async collect(input: CollectPilotEvidenceInput): Promise<ProctoringPilotEvidence> {
    const [predictedSessions, labels, latestReport] = await Promise.all([
      this.anomalyResultRepository.countDistinctParticipationsByExamModel({
        examId: input.examId,
        modelVersion: input.modelVersion,
      }),
      this.reviewLabelRepository.findByExamId(input.examId),
      this.evaluationReportRepository.findLatestForExamModel({
        examId: input.examId,
        modelVersion: input.modelVersion,
      }),
    ]);

    const labeledSessions = new Set(labels.map(label => label.participationId)).size;
    const predictionSessions = {
      actual: predictedSessions,
      required: MIN_PILOT_PREDICTION_SESSIONS,
      passed: predictedSessions >= MIN_PILOT_PREDICTION_SESSIONS,
    };
    const manualReviewLabels = {
      actual: labeledSessions,
      required: MIN_PILOT_LABEL_SESSIONS,
      passed: labeledSessions >= MIN_PILOT_LABEL_SESSIONS,
    };
    const latestEvaluationReport = latestReport
      ? {
          id: latestReport.id,
          status: latestReport.status,
          sampleSize: latestReport.sampleSize,
          generatedAt: toIsoString(latestReport.generatedAt),
        }
      : null;
    const evaluationReportPassed = latestEvaluationReport?.status === 'passed_gate';
    const blockers = [
      predictionSessions.passed ? null : 'prediction_sessions_below_minimum',
      manualReviewLabels.passed ? null : 'manual_review_labels_below_minimum',
      evaluationReportPassed ? null : 'missing_passed_evaluation_report',
    ].filter((blocker): blocker is string => Boolean(blocker));

    return {
      examId: input.examId,
      modelVersion: input.modelVersion,
      predictionSessions,
      manualReviewLabels,
      latestEvaluationReport,
      readyForAiAdvisory: blockers.length === 0,
      blockers,
    };
  }
}

export function formatPilotEvidenceReport(evidence: ProctoringPilotEvidence): string {
  return [
    `examId=${evidence.examId}`,
    `modelVersion=${evidence.modelVersion}`,
    `predictionSessions=${evidence.predictionSessions.actual}/${evidence.predictionSessions.required}`,
    `manualReviewLabels=${evidence.manualReviewLabels.actual}/${evidence.manualReviewLabels.required}`,
    `latestEvaluationReport=${evidence.latestEvaluationReport?.status ?? 'missing'}`,
    `READY_FOR_AI_ADVISORY=${evidence.readyForAiAdvisory ? 'true' : 'false'}`,
    `blockers=${evidence.blockers.length > 0 ? evidence.blockers.join(',') : 'none'}`,
  ].join('\n');
}

export function createProctoringPilotEvidenceService(): ProctoringPilotEvidenceService {
  return new ProctoringPilotEvidenceService();
}
