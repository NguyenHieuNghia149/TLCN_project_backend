import { AdminAuditLogRepository } from '@backend/api/repositories/adminAuditLog.repository';
import { ProctoringEvaluationReportRepository } from '@backend/api/repositories/proctoring/proctoringEvaluationReport.repository';
import { ProctoringReviewLabelRepository } from '@backend/api/repositories/proctoring/proctoringReviewLabel.repository';
import { ProctoringAnomalyResultRepository } from '@backend/shared/db/repositories/proctoringAnomalyResult.repository';

type EvaluationDependencies = {
  anomalyResultRepository?: Pick<
    ProctoringAnomalyResultRepository,
    'findLatestByParticipation' | 'countDistinctParticipationsByExamModel'
  >;
  reviewLabelRepository?: Pick<ProctoringReviewLabelRepository, 'findByExamId'>;
  evaluationReportRepository?: Pick<ProctoringEvaluationReportRepository, 'insert'>;
  auditLogRepository?: Pick<AdminAuditLogRepository, 'create'>;
};

type GenerateReportInput = {
  examId: string;
  modelVersion: string;
  featureSchemaVersion: string;
  scoringSchemaVersion: string;
  labelSchemaVersion?: string;
  datasetSnapshotRef: string;
  thresholds: Record<string, number>;
  generatedBy: string;
};

type ClassifiedExample = {
  participationId: string;
  windowId: string;
  score: number;
  threshold: number;
  label: string;
};

const POSITIVE_LABELS = new Set(['follow_up_required', 'policy_review_required']);
const NEGATIVE_LABELS = new Set(['no_action_needed']);
const MIN_PILOT_PREDICTION_SESSIONS = 50;
const MIN_PILOT_LABEL_SESSIONS = 10;

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

export class ProctoringEvaluationService {
  private readonly anomalyResultRepository: Pick<
    ProctoringAnomalyResultRepository,
    'findLatestByParticipation' | 'countDistinctParticipationsByExamModel'
  >;
  private readonly reviewLabelRepository: Pick<ProctoringReviewLabelRepository, 'findByExamId'>;
  private readonly evaluationReportRepository: Pick<ProctoringEvaluationReportRepository, 'insert'>;
  private readonly auditLogRepository: Pick<AdminAuditLogRepository, 'create'>;

  constructor(deps: EvaluationDependencies = {}) {
    this.anomalyResultRepository =
      deps.anomalyResultRepository ?? new ProctoringAnomalyResultRepository();
    this.reviewLabelRepository = deps.reviewLabelRepository ?? new ProctoringReviewLabelRepository();
    this.evaluationReportRepository =
      deps.evaluationReportRepository ?? new ProctoringEvaluationReportRepository();
    this.auditLogRepository = deps.auditLogRepository ?? new AdminAuditLogRepository();
  }

  async generateReport(input: GenerateReportInput) {
    const labels = await this.reviewLabelRepository.findByExamId(input.examId);
    const predictedSessions =
      await this.anomalyResultRepository.countDistinctParticipationsByExamModel({
        examId: input.examId,
        modelVersion: input.modelVersion,
      });
    const labeledSessions = new Set(labels.map(label => label.participationId)).size;
    const threshold = input.thresholds.high ?? input.thresholds.critical ?? 0.7;
    let truePositive = 0;
    let falsePositive = 0;
    let trueNegative = 0;
    let falseNegative = 0;
    const falsePositiveExamples: ClassifiedExample[] = [];
    const falseNegativeExamples: ClassifiedExample[] = [];

    for (const label of labels) {
      const isPositive = POSITIVE_LABELS.has(label.reviewOutcome);
      const isNegative = NEGATIVE_LABELS.has(label.reviewOutcome);
      if (!isPositive && !isNegative) {
        continue;
      }

      const results = await this.anomalyResultRepository.findLatestByParticipation(
        label.participationId
      );
      const latest = results
        .filter(result => result.modelVersion === input.modelVersion || !result.modelVersion)
        .sort((a, b) => Number(b.anomalyScore) - Number(a.anomalyScore))[0];
      if (!latest) {
        continue;
      }

      const predictedPositive = Number(latest.anomalyScore) >= threshold;
      if (predictedPositive && isPositive) {
        truePositive += 1;
      } else if (predictedPositive && isNegative) {
        falsePositive += 1;
        falsePositiveExamples.push({
          participationId: label.participationId,
          windowId: latest.windowId,
          score: Number(latest.anomalyScore),
          threshold,
          label: label.reviewOutcome,
        });
      } else if (!predictedPositive && isNegative) {
        trueNegative += 1;
      } else {
        falseNegative += 1;
        falseNegativeExamples.push({
          participationId: label.participationId,
          windowId: latest.windowId,
          score: Number(latest.anomalyScore),
          threshold,
          label: label.reviewOutcome,
        });
      }
    }

    const sampleSize = truePositive + falsePositive + trueNegative + falseNegative;
    const metricsJson = {
      precision: safeDivide(truePositive, truePositive + falsePositive),
      recall: safeDivide(truePositive, truePositive + falseNegative),
      falsePositiveRate: safeDivide(falsePositive, falsePositive + trueNegative),
    };
    const status =
      predictedSessions >= MIN_PILOT_PREDICTION_SESSIONS &&
      labeledSessions >= MIN_PILOT_LABEL_SESSIONS &&
      sampleSize > 0
        ? 'passed_gate'
        : 'insufficient_sample';

    const report = await this.evaluationReportRepository.insert({
      modelVersion: input.modelVersion,
      featureSchemaVersion: input.featureSchemaVersion,
      scoringSchemaVersion: input.scoringSchemaVersion,
      labelSchemaVersion: input.labelSchemaVersion ?? 'review-label-v1',
      datasetSnapshotRef: input.datasetSnapshotRef,
      sampleSize,
      positiveLabelPolicyJson: {
        positive: [...POSITIVE_LABELS],
        negative: [...NEGATIVE_LABELS],
        unknown: ['inconclusive'],
      },
      thresholdsJson: input.thresholds,
      metricsJson,
      confusionMatrixJson: {
        truePositive,
        falsePositive,
        trueNegative,
        falseNegative,
      },
      falsePositiveExamplesJson: falsePositiveExamples,
      falseNegativeExamplesJson: falseNegativeExamples,
      status,
      generatedBy: input.generatedBy,
      generatedAt: new Date(),
    });

    await this.auditLogRepository.create({
      actorType: 'user',
      actorId: input.generatedBy,
      action: 'proctoring_evaluation_report_generate',
      targetType: 'exam',
      targetId: input.examId,
      metadata: {
        modelVersion: input.modelVersion,
        sampleSize,
        predictedSessions,
        labeledSessions,
        status: report.status,
      },
    } as any);

    return report;
  }
}

export function createProctoringEvaluationService(): ProctoringEvaluationService {
  return new ProctoringEvaluationService();
}
