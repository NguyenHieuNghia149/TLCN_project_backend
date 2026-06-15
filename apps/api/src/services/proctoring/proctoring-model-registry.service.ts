import { AppException } from '@backend/api/exceptions/base.exception';
import { AdminAuditLogRepository } from '@backend/api/repositories/adminAuditLog.repository';
import { ProctoringEvaluationReportRepository } from '@backend/api/repositories/proctoring/proctoringEvaluationReport.repository';
import { ProctoringModelVersionRepository } from '@backend/api/repositories/proctoring/proctoringModelVersion.repository';
import { AiProctoringModelVersionEntity } from '@backend/shared/db/schema';

const ANOMALY_MODEL_TYPE = 'anomaly_detector';
const SUMMARY_MODEL_TYPE = 'summary_generator';

type ProctoringModelRegistryDependencies = {
  modelRepository?: Pick<
    ProctoringModelVersionRepository,
    'findDefaultActiveByType' | 'findByVersion' | 'insert' | 'activateDefault' | 'retire'
  >;
  evaluationReportRepository?: Pick<ProctoringEvaluationReportRepository, 'findLatestForModel'>;
  auditLogRepository?: Pick<AdminAuditLogRepository, 'create'>;
};

export type ResolvedAnomalyModel = Pick<
  AiProctoringModelVersionEntity,
  | 'id'
  | 'modelKey'
  | 'modelVersion'
  | 'modelType'
  | 'provider'
  | 'artifactUri'
  | 'featureSchemaVersion'
  | 'scoringSchemaVersion'
  | 'thresholdsJson'
  | 'status'
  | 'isDefault'
>;

export class ProctoringModelRegistryService {
  private readonly modelRepository: NonNullable<ProctoringModelRegistryDependencies['modelRepository']>;
  private readonly evaluationReportRepository: NonNullable<
    ProctoringModelRegistryDependencies['evaluationReportRepository']
  >;
  private readonly auditLogRepository: NonNullable<ProctoringModelRegistryDependencies['auditLogRepository']>;

  constructor(deps: ProctoringModelRegistryDependencies = {}) {
    this.modelRepository = deps.modelRepository ?? new ProctoringModelVersionRepository();
    this.evaluationReportRepository =
      deps.evaluationReportRepository ?? new ProctoringEvaluationReportRepository();
    this.auditLogRepository = deps.auditLogRepository ?? new AdminAuditLogRepository();
  }

  async resolveAnomalyModel(modelVersion?: string | null): Promise<ResolvedAnomalyModel> {
    const model = modelVersion
      ? await this.modelRepository.findByVersion(modelVersion)
      : await this.modelRepository.findDefaultActiveByType(ANOMALY_MODEL_TYPE);

    if (!model) {
      throw new AppException('Proctoring AI model was not found.', 404, 'PROCTORING_MODEL_NOT_FOUND');
    }
    if (model.modelType !== ANOMALY_MODEL_TYPE || model.status !== 'active') {
      throw new AppException(
        'Proctoring AI model is not active.',
        400,
        'PROCTORING_MODEL_NOT_ACTIVE'
      );
    }

    return {
      id: model.id,
      modelKey: model.modelKey,
      modelVersion: model.modelVersion,
      modelType: model.modelType,
      provider: model.provider,
      artifactUri: model.artifactUri,
      featureSchemaVersion: model.featureSchemaVersion,
      scoringSchemaVersion: model.scoringSchemaVersion,
      thresholdsJson: model.thresholdsJson,
      status: model.status,
      isDefault: model.isDefault,
    };
  }

  async activateDefault(input: {
    modelVersion: string;
    actorId?: string | null;
    reason?: string;
  }): Promise<AiProctoringModelVersionEntity> {
    const existing = await this.modelRepository.findByVersion(input.modelVersion);
    if (!existing) {
      throw new AppException('Proctoring AI model was not found.', 404, 'PROCTORING_MODEL_NOT_FOUND');
    }
    if (existing.modelType !== ANOMALY_MODEL_TYPE) {
      throw new AppException(
        'Only anomaly detector models can be activated through this service.',
        400,
        'PROCTORING_MODEL_TYPE_UNSUPPORTED'
      );
    }

    const activated = await this.modelRepository.activateDefault({
      modelVersion: input.modelVersion,
      modelType: ANOMALY_MODEL_TYPE,
    });

    await this.auditLogRepository.create({
      actorType: 'user',
      actorId: input.actorId ?? null,
      action: 'proctoring_model_activate_default',
      targetType: 'ai_proctoring_model_version',
      targetId: activated.id,
      metadata: {
        modelVersion: input.modelVersion,
        modelType: ANOMALY_MODEL_TYPE,
        reason: input.reason,
      },
    });

    return activated;
  }

  async retire(input: {
    modelVersion: string;
    actorId?: string | null;
    reason?: string;
  }): Promise<AiProctoringModelVersionEntity> {
    const retired = await this.modelRepository.retire(input.modelVersion);
    if (!retired) {
      throw new AppException('Proctoring AI model was not found.', 404, 'PROCTORING_MODEL_NOT_FOUND');
    }

    await this.auditLogRepository.create({
      actorType: 'user',
      actorId: input.actorId ?? null,
      action: 'proctoring_model_retire',
      targetType: 'ai_proctoring_model_version',
      targetId: retired.id,
      metadata: {
        modelVersion: input.modelVersion,
        reason: input.reason,
      },
    });

    return retired;
  }

  async assertAiVisibilityGate(input: {
    modelVersion?: string | null;
    minimumEvaluationStatus: 'passed_gate';
  }): Promise<void> {
    const model = await this.resolveAnomalyModel(input.modelVersion);
    const report = await this.evaluationReportRepository.findLatestForModel(model.modelVersion);

    if (!report || report.status !== input.minimumEvaluationStatus) {
      throw new AppException(
        'Proctoring AI advisory visibility gate is not met.',
        400,
        'PROCTORING_AI_VISIBILITY_GATE_NOT_MET',
        {
          modelVersion: model.modelVersion,
          requiredStatus: input.minimumEvaluationStatus,
          actualStatus: report?.status ?? 'missing',
        }
      );
    }
  }

  async resolveSummaryModel(modelVersion?: string | null): Promise<ResolvedAnomalyModel> {
    const model = modelVersion
      ? await this.modelRepository.findByVersion(modelVersion)
      : await this.modelRepository.findDefaultActiveByType(SUMMARY_MODEL_TYPE);

    if (!model) {
      throw new AppException(
        'Proctoring summary model was not found.',
        404,
        'PROCTORING_SUMMARY_MODEL_NOT_FOUND'
      );
    }
    if (model.modelType !== SUMMARY_MODEL_TYPE || model.status !== 'active') {
      throw new AppException(
        'Proctoring summary model is not active.',
        400,
        'PROCTORING_SUMMARY_MODEL_NOT_ACTIVE'
      );
    }
    return {
      id: model.id,
      modelKey: model.modelKey,
      modelVersion: model.modelVersion,
      modelType: model.modelType,
      provider: model.provider,
      artifactUri: model.artifactUri,
      featureSchemaVersion: model.featureSchemaVersion,
      scoringSchemaVersion: model.scoringSchemaVersion,
      thresholdsJson: model.thresholdsJson,
      status: model.status,
      isDefault: model.isDefault,
    };
  }
}

export function createProctoringModelRegistryService(): ProctoringModelRegistryService {
  return new ProctoringModelRegistryService();
}
