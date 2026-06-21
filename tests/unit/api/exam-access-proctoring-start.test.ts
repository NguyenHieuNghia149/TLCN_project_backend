import { AppException } from '@backend/api/exceptions/base.exception';
import { ExamAccessService } from '@backend/api/services/exam-access.service';

function createDependencies(overrides: Partial<any> = {}) {
  return {
    examRepository: {},
    examToProblemsRepository: {},
    examParticipationRepository: {},
    examParticipantRepository: {},
    examInviteRepository: {},
    examEntrySessionRepository: {},
    examAuditLogRepository: {},
    userRepository: {},
    tokenRepository: {},
    emailService: {},
    ...overrides,
  };
}

describe('ExamAccessService proctoring start gate', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('rejects proctored exam start without accepted consent before creating participation', async () => {
    const proctoringStartGateService = {
      validateStartRequest: jest.fn().mockRejectedValue(
        new AppException('Accepted consent is required', 403, 'PROCTORING_CONSENT_REQUIRED'),
      ),
      createSessionRecord: jest.fn(),
    };
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2026-06-01T09:00:00.000Z'),
        endDate: new Date('2099-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        expiresAt: new Date('2099-06-11T12:00:00.000Z'),
      }),
      markStarted: jest.fn(),
      markExpired: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        accessStatus: 'eligible',
      }),
      updateAccessStatus: jest.fn(),
    } as any;
    const examParticipationRepository = {
      countAttemptsByParticipant: jest.fn().mockResolvedValue(0),
      createAttempt: jest.fn(),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examEntrySessionRepository,
        examParticipantRepository,
        examParticipationRepository,
        examToProblemsRepository,
        examAuditLogRepository,
        proctoringStartGateService,
      }),
    );

    await expect(
      (service as any).startEntrySession('entry-session-1', 'user-1', undefined, {
        clientSessionId: 'client-session-1',
        consentRecordId: 'consent-1',
        precheckId: 'precheck-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PROCTORING_CONSENT_REQUIRED',
    });
    expect(examParticipationRepository.createAttempt).not.toHaveBeenCalled();
    expect(proctoringStartGateService.validateStartRequest).toHaveBeenCalledTimes(1);
    expect(proctoringStartGateService.createSessionRecord).not.toHaveBeenCalled();
  });

  it('rejects proctored exam start when the precheck is expired', async () => {
    const proctoringStartGateService = {
      validateStartRequest: jest.fn().mockRejectedValue(
        new AppException('Precheck expired', 409, 'PROCTORING_PRECHECK_EXPIRED'),
      ),
      createSessionRecord: jest.fn(),
    };
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2026-06-01T09:00:00.000Z'),
        endDate: new Date('2099-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        expiresAt: new Date('2099-06-11T12:00:00.000Z'),
      }),
      markStarted: jest.fn(),
      markExpired: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        accessStatus: 'eligible',
      }),
      updateAccessStatus: jest.fn(),
    } as any;
    const examParticipationRepository = {
      countAttemptsByParticipant: jest.fn().mockResolvedValue(0),
      createAttempt: jest.fn(),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examEntrySessionRepository,
        examParticipantRepository,
        examParticipationRepository,
        examToProblemsRepository,
        examAuditLogRepository,
        proctoringStartGateService,
      }),
    );

    await expect(
      (service as any).startEntrySession('entry-session-1', 'user-1', undefined, {
        clientSessionId: 'client-session-1',
        consentRecordId: 'consent-1',
        precheckId: 'precheck-expired',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROCTORING_PRECHECK_EXPIRED',
    });
    expect(examParticipationRepository.createAttempt).not.toHaveBeenCalled();
    expect(proctoringStartGateService.validateStartRequest).toHaveBeenCalledTimes(1);
  });

  it('creates and links a proctoring session when bypass validation succeeds', async () => {
    const proctoringStartGateService = {
      validateStartRequest: jest.fn().mockResolvedValue({
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        clientSessionId: 'client-session-1',
        consentRecordId: 'consent-1',
        bypassCodeId: 'bypass-code-1',
      }),
      createSessionRecord: jest.fn().mockResolvedValue({
        id: 'proctoring-session-1',
      }),
    };
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2026-06-01T09:00:00.000Z'),
        endDate: new Date('2099-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        expiresAt: new Date('2099-06-11T12:00:00.000Z'),
      }),
      markStarted: jest.fn().mockResolvedValue(undefined),
      markExpired: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        accessStatus: 'eligible',
      }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      countAttemptsByParticipant: jest.fn().mockResolvedValue(0),
      createAttempt: jest.fn().mockResolvedValue({
        id: 'participation-1',
        expiresAt: new Date('2026-06-11T11:00:00.000Z'),
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;

    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examEntrySessionRepository,
        examParticipantRepository,
        examParticipationRepository,
        examToProblemsRepository,
        examAuditLogRepository,
        proctoringStartGateService,
      }),
    );

    await expect(
      (service as any).startEntrySession('entry-session-1', 'user-1', undefined, {
        clientSessionId: 'client-session-1',
        consentRecordId: 'consent-1',
        precheckId: 'precheck-1',
        bypassCode: 'ABC-123',
        bypassCodeId: 'bypass-code-1',
      }),
    ).resolves.toMatchObject({
      participationId: 'participation-1',
    });
    expect(examParticipationRepository.createAttempt).toHaveBeenCalledTimes(1);
    expect(examEntrySessionRepository.markStarted).toHaveBeenCalledWith(
      'entry-session-1',
      'participation-1',
      expect.any(Date),
    );
    expect(proctoringStartGateService.createSessionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        participationId: 'participation-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        clientSessionId: 'client-session-1',
        consentRecordId: 'consent-1',
        bypassCodeId: 'bypass-code-1',
      }),
    );
  });
});
