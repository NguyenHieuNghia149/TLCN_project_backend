describe('ProctoringConsentService', () => {
  const loadService = () => require('@backend/api/services/proctoring/proctoring-consent.service');

  it('records consent with a server-generated immutable snapshot', async () => {
    jest.resetModules();
    const consentRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'consent-1',
        status: 'accepted',
      }),
      findLatestAcceptedForCandidate: jest.fn(),
      findByParticipation: jest.fn(),
      withdraw: jest.fn(),
    };
    const settingsRepository = {
      findByExamId: jest.fn().mockResolvedValue({
        id: 'settings-1',
        examId: 'exam-1',
        enabled: true,
        consentNoticeVersion: 'phase-1',
        legalLinksJson: { privacy: 'https://example.com/privacy' },
        dataRetentionDays: 180,
        dataDeletionSlaDays: 20,
        sensitiveDataDeletionTargetHours: 72,
      }),
    };
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
      }),
    };
    const { ProctoringConsentService } = loadService();
    const service = new ProctoringConsentService({
      consentRepository,
      settingsRepository,
      examRepository,
    });

    const result = await service.acceptConsent('spring-midterm', 'user-1', {
      accepted: true,
      clientSessionId: 'client-session-1',
      acceptedCapabilitiesJson: { camera: true },
    });

    expect(examRepository.findBySlug).toHaveBeenCalledWith('spring-midterm');
    expect(settingsRepository.findByExamId).toHaveBeenCalledWith('exam-1');
    expect(consentRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        candidateUserId: 'user-1',
        clientSessionId: 'client-session-1',
        status: 'accepted',
        noticeVersion: 'phase-1',
        legalLinksSnapshotJson: { privacy: 'https://example.com/privacy' },
      }),
    );
    expect(result).toMatchObject({ id: 'consent-1', status: 'accepted' });
  });

  it('withdraws the latest consent for a participation', async () => {
    jest.resetModules();
    const consentRepository = {
      insert: jest.fn(),
      findLatestAcceptedForCandidate: jest.fn(),
      findByParticipation: jest.fn().mockResolvedValue([
        {
          id: 'consent-1',
          participationId: 'participation-1',
          status: 'accepted',
        },
      ]),
      withdraw: jest.fn().mockResolvedValue({
        id: 'consent-1',
        status: 'withdrawn',
      }),
    };
    const settingsRepository = { findByExamId: jest.fn() };
    const examRepository = { findBySlug: jest.fn() };
    const { ProctoringConsentService } = loadService();
    const service = new ProctoringConsentService({
      consentRepository,
      settingsRepository,
      examRepository,
    });

    const result = await service.withdrawConsent('participation-1', 'user-1');

    expect(consentRepository.withdraw).toHaveBeenCalledWith('consent-1', expect.any(Date));
    expect(result).toMatchObject({ status: 'withdrawn' });
  });
});
