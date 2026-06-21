describe('ProctoringPrecheckService', () => {
  const loadService = () => require('@backend/api/services/proctoring/proctoring-precheck.service');

  it('records a precheck expiry using the configured validity window', async () => {
    jest.resetModules();
    const precheckRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'precheck-1',
        passed: true,
      }),
      findById: jest.fn(),
      findValidPassedById: jest.fn(),
      findByParticipation: jest.fn(),
    };
    const consentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'consent-1',
        examId: 'exam-1',
        candidateUserId: 'user-1',
        clientSessionId: 'client-session-1',
        status: 'accepted',
      }),
    };
    const settingsRepository = {
      findByExamId: jest.fn().mockResolvedValue({
        id: 'settings-1',
        examId: 'exam-1',
        precheckValiditySeconds: 300,
        requireMonitorDisplaySurface: true,
      }),
    };
    const { ProctoringPrecheckService } = loadService();
    const service = new ProctoringPrecheckService({
      precheckRepository,
      consentRepository,
      settingsRepository,
    });
    const now = new Date('2026-06-11T00:00:00.000Z');

    const result = await service.createPrecheck('spring-midterm', 'user-1', {
      consentRecordId: 'consent-1',
      clientSessionId: 'client-session-1',
      browserName: 'Chromium',
      browserVersion: '126',
      osName: 'Windows',
      getUserMediaSupported: true,
      cameraPermissionGranted: true,
      getDisplayMediaSupported: true,
      displaySurface: 'monitor',
      monitorValidated: true,
      fullscreenSupported: true,
      browserSupported: true,
      now,
    } as any);

    expect(precheckRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date('2026-06-11T00:05:00.000Z'),
        passed: true,
      }),
    );
    expect(result).toMatchObject({ id: 'precheck-1', passed: true });
  });

  it('flags surface_unknown as a failure when monitor display is required', async () => {
    jest.resetModules();
    const precheckRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'precheck-1',
        passed: false,
      }),
      findById: jest.fn(),
      findValidPassedById: jest.fn(),
      findByParticipation: jest.fn(),
    };
    const consentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'consent-1',
        examId: 'exam-1',
        candidateUserId: 'user-1',
        clientSessionId: 'client-session-1',
        status: 'accepted',
      }),
    };
    const settingsRepository = {
      findByExamId: jest.fn().mockResolvedValue({
        id: 'settings-1',
        examId: 'exam-1',
        precheckValiditySeconds: 300,
        requireMonitorDisplaySurface: true,
      }),
    };
    const { ProctoringPrecheckService } = loadService();
    const service = new ProctoringPrecheckService({
      precheckRepository,
      consentRepository,
      settingsRepository,
    });

    const result = await service.createPrecheck('spring-midterm', 'user-1', {
      consentRecordId: 'consent-1',
      clientSessionId: 'client-session-1',
      browserName: 'Chromium',
      browserVersion: '126',
      osName: 'Windows',
      getUserMediaSupported: true,
      cameraPermissionGranted: true,
      getDisplayMediaSupported: true,
      displaySurface: 'surface_unknown',
      monitorValidated: false,
      fullscreenSupported: true,
      browserSupported: true,
    } as any);

    expect(precheckRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        failureReasonsJson: expect.arrayContaining([expect.stringContaining('surface')]),
      }),
    );
    expect(result.passed).toBe(false);
  });
});
