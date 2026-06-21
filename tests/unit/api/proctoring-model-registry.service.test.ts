import { ProctoringModelRegistryService } from '../../../apps/api/src/services/proctoring/proctoring-model-registry.service';

const activeModel = {
  id: 'model-id',
  modelKey: 'iforest-browser',
  modelVersion: 'iforest-browser-v1.0.0',
  modelType: 'anomaly_detector',
  provider: 'sklearn',
  artifactUri: 'models/isolation_forest/v1/model.joblib',
  featureSchemaVersion: 'browser-window-v1',
  scoringSchemaVersion: 'anomaly-score-v1',
  thresholdsJson: { medium: 0.5, high: 0.7, critical: 0.9 },
  status: 'active',
  isDefault: true,
};

function createService(overrides: Partial<any> = {}) {
  const modelRepository = {
    findDefaultActiveByType: jest.fn().mockResolvedValue(activeModel),
    findByVersion: jest.fn().mockResolvedValue(activeModel),
    insert: jest.fn().mockImplementation(async values => ({ id: 'new-model', ...values })),
    activateDefault: jest.fn().mockImplementation(async input => ({
      ...activeModel,
      modelVersion: input.modelVersion,
      isDefault: true,
      status: 'active',
    })),
    retire: jest.fn().mockImplementation(async modelVersion => ({
      ...activeModel,
      modelVersion,
      status: 'retired',
      isDefault: false,
    })),
  };
  const evaluationReportRepository = {
    findLatestForModel: jest.fn().mockResolvedValue({
      id: 'report-1',
      modelVersion: activeModel.modelVersion,
      status: 'passed_gate',
      sampleSize: 50,
    }),
  };
  const auditLogRepository = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const service = new ProctoringModelRegistryService({
    modelRepository,
    evaluationReportRepository,
    auditLogRepository,
    ...(overrides as any),
  });

  return { service, modelRepository, evaluationReportRepository, auditLogRepository };
}

describe('ProctoringModelRegistryService', () => {
  it('resolves the active default anomaly model with schema and thresholds', async () => {
    const { service, modelRepository } = createService();

    const result = await service.resolveAnomalyModel();

    expect(modelRepository.findDefaultActiveByType).toHaveBeenCalledWith('anomaly_detector');
    expect(result).toMatchObject({
      modelVersion: 'iforest-browser-v1.0.0',
      featureSchemaVersion: 'browser-window-v1',
      scoringSchemaVersion: 'anomaly-score-v1',
      thresholdsJson: { medium: 0.5, high: 0.7, critical: 0.9 },
    });
  });

  it('rejects selected unknown or retired model versions', async () => {
    const { service, modelRepository } = createService();
    modelRepository.findByVersion.mockResolvedValueOnce(null);

    await expect(service.resolveAnomalyModel('missing-model')).rejects.toMatchObject({
      statusCode: 404,
      code: 'PROCTORING_MODEL_NOT_FOUND',
    });

    modelRepository.findByVersion.mockResolvedValueOnce({
      ...activeModel,
      status: 'retired',
      isDefault: false,
    });

    await expect(service.resolveAnomalyModel('iforest-browser-v0.9.0')).rejects.toMatchObject({
      statusCode: 400,
      code: 'PROCTORING_MODEL_NOT_ACTIVE',
    });
  });

  it('activates one default model per model type and writes an audit event', async () => {
    const { service, modelRepository, auditLogRepository } = createService();

    const result = await service.activateDefault({
      modelVersion: 'iforest-browser-v1.0.1',
      actorId: 'owner-1',
      reason: 'Passed evaluation gate.',
    });

    expect(modelRepository.activateDefault).toHaveBeenCalledWith({
      modelVersion: 'iforest-browser-v1.0.1',
      modelType: 'anomaly_detector',
    });
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'proctoring_model_activate_default',
        targetType: 'ai_proctoring_model_version',
        metadata: expect.objectContaining({
          modelVersion: 'iforest-browser-v1.0.1',
          reason: 'Passed evaluation gate.',
        }),
      })
    );
    expect(result).toMatchObject({ modelVersion: 'iforest-browser-v1.0.1', isDefault: true });
  });

  it('allows AI visibility only for active model with passing evaluation gate', async () => {
    const { service, evaluationReportRepository } = createService();

    await expect(
      service.assertAiVisibilityGate({
        modelVersion: 'iforest-browser-v1.0.0',
        minimumEvaluationStatus: 'passed_gate',
      })
    ).resolves.toBeUndefined();

    evaluationReportRepository.findLatestForModel.mockResolvedValueOnce({
      id: 'report-2',
      modelVersion: activeModel.modelVersion,
      status: 'insufficient_sample',
    });

    await expect(
      service.assertAiVisibilityGate({
        modelVersion: 'iforest-browser-v1.0.0',
        minimumEvaluationStatus: 'passed_gate',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'PROCTORING_AI_VISIBILITY_GATE_NOT_MET',
    });
  });
});
