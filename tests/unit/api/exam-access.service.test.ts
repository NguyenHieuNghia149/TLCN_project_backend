import { ExamAccessService } from '@backend/api/services/exam-access.service';
import type { AppException } from '@backend/api/exceptions/base.exception';
import {
  AuthorizationException,
  RateLimitExceededException,
  ValidationException,
} from '@backend/api/exceptions/auth.exceptions';
import { ExamNotStartedException } from '@backend/api/exceptions/exam.exceptions';

function createDependencies(overrides: Partial<any> = {}) {
  return {
    examRepository: {} as any,
    examToProblemsRepository: {} as any,
    examParticipationRepository: {} as any,
    examParticipantRepository: {} as any,
    examInviteRepository: {} as any,
    examEntrySessionRepository: {} as any,
    examAuditLogRepository: {} as any,
    userRepository: {} as any,
    tokenRepository: {} as any,
    emailService: {} as any,
    ...overrides,
  };
}

describe('ExamAccessService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('allows toggling visibility for legacy self-registration exams with null approval mode', async () => {
    const examRepository = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'exam-1',
          title: 'Legacy Exam',
          slug: 'legacy-exam',
          duration: 90,
          startDate: new Date('2099-05-01T09:00:00.000Z'),
          endDate: new Date('2099-05-01T12:00:00.000Z'),
          isVisible: true,
          maxAttempts: 1,
          createdBy: 'teacher-1',
          status: 'draft',
          accessMode: 'open_registration',
          selfRegistrationApprovalMode: null,
          selfRegistrationPasswordRequired: false,
          allowExternalCandidates: false,
          registrationOpenAt: null,
          registrationCloseAt: null,
          createdAt: new Date('2099-04-01T09:00:00.000Z'),
          updatedAt: new Date('2099-04-01T09:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'exam-1',
          title: 'Legacy Exam',
          slug: 'legacy-exam',
          duration: 90,
          startDate: new Date('2099-05-01T09:00:00.000Z'),
          endDate: new Date('2099-05-01T12:00:00.000Z'),
          isVisible: false,
          maxAttempts: 1,
          createdBy: 'teacher-1',
          status: 'draft',
          accessMode: 'open_registration',
          selfRegistrationApprovalMode: null,
          selfRegistrationPasswordRequired: false,
          allowExternalCandidates: false,
          registrationOpenAt: null,
          registrationCloseAt: null,
          createdAt: new Date('2099-04-01T09:00:00.000Z'),
          updatedAt: new Date('2099-04-01T09:00:00.000Z'),
        }),
      update: jest.fn().mockResolvedValue({
        id: 'exam-1',
        isVisible: false,
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examToProblemsRepository,
      }),
    );

    await expect(
      service.updateAdminExam('exam-1', 'teacher-1', {
        isVisible: false,
      }),
    ).resolves.toMatchObject({
      id: 'exam-1',
      isVisible: false,
    });
    expect(examRepository.update).toHaveBeenCalledWith(
      'exam-1',
      expect.objectContaining({ isVisible: false }),
    );
  });

  it('rejects publishing when exam is no longer in draft status', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'cancelled',
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
      publishIfDraft: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
      }),
    );

    await expect(service.publishExam('exam-1', 'teacher-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EXAM_STATUS_TRANSITION_INVALID',
    });
    expect(examRepository.publishIfDraft).not.toHaveBeenCalled();
  });

  it('cancels a published exam only when there are no participants', async () => {
    const examRepository = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'exam-1',
          status: 'published',
          endDate: new Date('2099-05-01T12:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'exam-1',
          status: 'cancelled',
          isVisible: false,
          endDate: new Date('2099-05-01T12:00:00.000Z'),
          createdAt: new Date('2099-04-01T00:00:00.000Z'),
          updatedAt: new Date('2099-04-01T00:00:00.000Z'),
          title: 'Exam',
          slug: 'exam',
          duration: 90,
          maxAttempts: 1,
          accessMode: 'open_registration',
          selfRegistrationApprovalMode: 'auto',
          selfRegistrationPasswordRequired: false,
          allowExternalCandidates: false,
          registrationOpenAt: null,
          registrationCloseAt: null,
        }),
      countActiveParticipants: jest.fn().mockResolvedValue(0),
      cancelIfPublishedWithoutParticipants: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'cancelled',
        isVisible: false,
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
        examToProblemsRepository,
        examAuditLogRepository,
      }),
    );

    const result = await service.cancelExam('exam-1', 'teacher-1');

    expect(examRepository.cancelIfPublishedWithoutParticipants).toHaveBeenCalledWith('exam-1');
    expect(result).toMatchObject({
      id: 'exam-1',
      status: 'cancelled',
      isVisible: false,
    });
  });

  it('rejects cancelling an exam when participants already exist', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
      countActiveParticipants: jest.fn().mockResolvedValue(2),
      cancelIfPublishedWithoutParticipants: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
      }),
    );

    await expect(service.cancelExam('exam-1', 'teacher-1')).rejects.toMatchObject({
      statusCode: 422,
      code: 'EXAM_CANCEL_HAS_PARTICIPANTS',
    });
    expect(examRepository.cancelIfPublishedWithoutParticipants).not.toHaveBeenCalled();
  });

  it('archives a cancelled exam without requiring end date to pass', async () => {
    const examRepository = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'exam-1',
          status: 'cancelled',
          endDate: new Date('2099-05-01T12:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'exam-1',
          status: 'archived',
          isVisible: false,
          endDate: new Date('2099-05-01T12:00:00.000Z'),
          createdAt: new Date('2099-04-01T00:00:00.000Z'),
          updatedAt: new Date('2099-04-01T00:00:00.000Z'),
          title: 'Exam',
          slug: 'exam',
          duration: 90,
          maxAttempts: 1,
          accessMode: 'open_registration',
          selfRegistrationApprovalMode: 'auto',
          selfRegistrationPasswordRequired: false,
          allowExternalCandidates: false,
          registrationOpenAt: null,
          registrationCloseAt: null,
        }),
      archiveCancelled: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'archived',
        isVisible: false,
      }),
      archivePublishedIfEnded: jest.fn(),
      countActiveParticipants: jest.fn().mockResolvedValue(0),
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
        examToProblemsRepository,
        examAuditLogRepository,
      }),
    );

    const result = await service.archiveExam('exam-1', 'teacher-1');

    expect(examRepository.archiveCancelled).toHaveBeenCalledWith('exam-1');
    expect(examRepository.archivePublishedIfEnded).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'exam-1',
      status: 'archived',
      isVisible: false,
    });
  });

  it('rejects archiving a published exam before endDate', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
      archivePublishedIfEnded: jest.fn(),
      archiveCancelled: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
      }),
    );

    await expect(service.archiveExam('exam-1', 'teacher-1')).rejects.toMatchObject({
      statusCode: 422,
      code: 'EXAM_ARCHIVE_NOT_ENDED',
    });
    expect(examRepository.archivePublishedIfEnded).not.toHaveBeenCalled();
  });

  it('blocks invite resolution when exam is not published', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        status: 'cancelled',
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
      }),
    );

    await expect(
      service.resolveInvite('spring-midterm', {
        inviteToken: 'invite-token',
        userId: null,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'EXAM_NOT_AVAILABLE',
    } as Partial<AppException>);
  });

  it('returns the existing access state instead of creating a duplicate participant in hybrid mode', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        title: 'Spring Midterm',
        accessMode: 'hybrid',
        selfRegistrationApprovalMode: 'manual',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        startDate: new Date('2026-05-01T09:00:00.000Z'),
        endDate: new Date('2026-05-01T12:00:00.000Z'),
        registrationOpenAt: new Date('2026-04-29T09:00:00.000Z'),
        registrationCloseAt: new Date('2026-05-01T11:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      }),
      create: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'student@example.com',
            firstName: 'Exam',
            lastName: 'Student',
          }),
          findByEmail: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    const result = await service.registerForExam('spring-midterm', {
      email: 'student@example.com',
      fullName: 'Exam Student',
      userId: 'user-1',
    });

    expect(examParticipantRepository.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      participantId: 'participant-1',
      approvalStatus: 'approved',
      accessStatus: 'invited',
      created: false,
    });
  });

  it('always rejects register path for invite-only exams even when a participant already exists', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'invite-only-midterm',
        title: 'Invite Only Midterm',
        accessMode: 'invite_only',
        selfRegistrationApprovalMode: null,
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        startDate: new Date('2099-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      }),
      create: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'student@example.com',
            firstName: 'Exam',
            lastName: 'Student',
          }),
          findByEmail: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.registerForExam('invite-only-midterm', {
        email: 'student@example.com',
        fullName: 'Exam Student',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);
    expect(examParticipantRepository.findByExamAndIdentity).not.toHaveBeenCalled();
    expect(examParticipantRepository.create).not.toHaveBeenCalled();
  });

  it('marks a fresh self-registration as created so the HTTP layer can emit 201 Created', async () => {
    const createdParticipant = {
      id: 'participant-2',
      examId: 'exam-1',
      userId: 'user-1',
      approvalStatus: 'approved',
      accessStatus: 'eligible',
      source: 'self_registration',
      normalizedEmail: 'student@example.com',
      fullName: 'Exam Student',
    };
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        title: 'Spring Midterm',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'auto',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2099-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdParticipant),
      bindUser: jest.fn().mockResolvedValue(createdParticipant),
      updateAccessStatus: jest.fn(),
    } as any;
    const examEntrySessionRepository = {
      createOrResumeVerifiedSession: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-2',
        status: 'eligible',
        expiresAt: new Date('2099-05-03T12:00:00.000Z'),
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examEntrySessionRepository,
        examAuditLogRepository: {
          create: jest.fn().mockResolvedValue(undefined),
        },
        userRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'student@example.com',
            firstName: 'Exam',
            lastName: 'Student',
          }),
          findByEmail: jest.fn().mockResolvedValue(null),
        },
        emailService: {
          sendMail: jest.fn().mockResolvedValue(undefined),
        },
      }),
    );

    const result = await service.registerForExam('spring-midterm', {
      email: 'student@example.com',
      fullName: 'Exam Student',
      userId: 'user-1',
    });

    expect(examParticipantRepository.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      participantId: 'participant-2',
      approvalStatus: 'approved',
      accessStatus: 'eligible',
      created: true,
    });
  });

  it('rejects self-registration before the registration window opens', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        title: 'Spring Midterm',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'manual',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        startDate: new Date('2099-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
        registrationOpenAt: new Date('2099-04-30T09:00:00.000Z'),
        registrationCloseAt: new Date('2099-05-01T11:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.registerForExam('spring-midterm', {
        email: 'student@example.com',
        fullName: 'Exam Student',
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);
    expect(examParticipantRepository.create).not.toHaveBeenCalled();
  });

  it('rejects anonymous registration when external candidates are disabled', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'internal-only-midterm',
        title: 'Internal Only Midterm',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'auto',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: false,
        status: 'published',
        duration: 90,
        startDate: new Date('2099-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.registerForExam('internal-only-midterm', {
        email: 'guest@example.com',
        fullName: 'Guest Student',
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);
    expect(examParticipantRepository.create).not.toHaveBeenCalled();
  });

  it('rejects adding external participants from admin tools when the exam disables them', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        allowExternalCandidates: false,
      }),
    } as any;
    const examParticipantRepository = {
      create: jest.fn(),
      findByExamAndIdentity: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
      }),
    );

    await expect(
      service.addAdminExamParticipants('exam-1', 'teacher-1', {
        participants: [
          {
            email: 'guest@example.com',
            fullName: 'Guest Student',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationException);
    expect(examParticipantRepository.create).not.toHaveBeenCalled();
  });

  it('requires sign-in instead of anonymous registration when the email already belongs to a real user', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        title: 'Spring Midterm',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'manual',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        startDate: new Date('2099-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'student@example.com',
            isShadowAccount: false,
          }),
        },
      }),
    );

    await expect(
      service.registerForExam('spring-midterm', {
        email: 'student@example.com',
        fullName: 'Exam Student',
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);
    expect(examParticipantRepository.create).not.toHaveBeenCalled();
  });

  it('returns the existing participation when the entry session was already started', async () => {
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        participationId: 'participation-1',
        status: 'started',
      }),
      updateById: jest.fn(),
    } as any;
    const examParticipationRepository = {
      createAttempt: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        expiresAt: new Date('2026-05-01T10:30:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examEntrySessionRepository,
        examParticipationRepository,
        examParticipantRepository,
      }),
    );

    const result = await service.startEntrySession('entry-session-1', 'user-1');

    expect(examParticipationRepository.createAttempt).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      participationId: 'participation-1',
      expiresAt: '2026-05-01T10:30:00.000Z',
    });
  });

  it('reuses active in-progress participation when start is called from a newer eligible session', async () => {
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-2',
        examId: 'exam-1',
        participantId: 'participant-1',
        participationId: null,
        status: 'eligible',
        expiresAt: new Date('2099-05-03T10:30:00.000Z'),
      }),
      markStarted: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2099-05-01T10:30:00.000Z'),
      }),
      createAttempt: jest.fn(),
      countAttemptsByParticipant: jest.fn().mockResolvedValue(1),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        accessStatus: 'active',
      }),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2020-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examEntrySessionRepository,
        examParticipationRepository,
        examParticipantRepository,
        examRepository,
      }),
    );

    const result = await service.startEntrySession('entry-session-2', 'user-1');

    expect(examParticipationRepository.createAttempt).not.toHaveBeenCalled();
    expect(examEntrySessionRepository.markStarted).toHaveBeenCalledWith(
      'entry-session-2',
      'participation-1',
      expect.any(Date),
    );
    expect(result).toMatchObject({
      participationId: 'participation-1',
      expiresAt: '2099-05-01T10:30:00.000Z',
    });
  });

  it('resumes the in-progress participation even when latest attempt is submitted and maxAttempts is already reached', async () => {
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-3',
        examId: 'exam-1',
        participantId: 'participant-1',
        participationId: null,
        status: 'eligible',
        expiresAt: new Date('2099-05-03T10:30:00.000Z'),
      }),
      markStarted: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      // Simulate latest row being submitted (can happen with ordering edge cases / legacy rows).
      findLatestByParticipant: jest.fn().mockResolvedValue({
        id: 'participation-submitted',
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'SUBMITTED',
        expiresAt: new Date('2099-05-01T10:30:00.000Z'),
      }),
      // Canonical row we must resume.
      findInProgressByExamAndUser: jest.fn().mockResolvedValue({
        id: 'participation-in-progress',
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2099-05-01T11:30:00.000Z'),
      }),
      createAttempt: jest.fn(),
      countAttemptsByParticipant: jest.fn().mockResolvedValue(1),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        accessStatus: 'active',
      }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2020-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examEntrySessionRepository,
        examParticipationRepository,
        examParticipantRepository,
        examRepository,
      }),
    );

    const result = await service.startEntrySession('entry-session-3', 'user-1');

    expect(examParticipationRepository.createAttempt).not.toHaveBeenCalled();
    expect(examParticipationRepository.countAttemptsByParticipant).not.toHaveBeenCalled();
    expect(examEntrySessionRepository.markStarted).toHaveBeenCalledWith(
      'entry-session-3',
      'participation-in-progress',
      expect.any(Date),
    );
    expect(result).toMatchObject({
      participationId: 'participation-in-progress',
      expiresAt: '2099-05-01T11:30:00.000Z',
    });
  });

  it('does not auto-create a new eligible entry session when an in-progress participation already exists', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'open-midterm',
        title: 'Open Midterm',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'auto',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2026-04-01T09:00:00.000Z'),
        endDate: new Date('2099-04-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        normalizedEmail: 'student@example.com',
        source: 'self_registration',
        approvalStatus: 'approved',
        accessStatus: 'active',
      }),
    } as any;
    const examEntrySessionRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue({
        id: 'entry-session-latest',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        participationId: null,
        expiresAt: new Date('2099-04-01T12:00:00.000Z'),
      }),
      findByParticipationId: jest.fn().mockResolvedValue({
        id: 'entry-session-started',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'started',
        participationId: 'participation-1',
        expiresAt: new Date('2099-04-01T12:00:00.000Z'),
      }),
      createOrResumeVerifiedSession: jest.fn(),
    } as any;
    const examParticipationRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2099-04-01T10:30:00.000Z'),
      }),
      countAttemptsByParticipant: jest.fn().mockResolvedValue(1),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examEntrySessionRepository,
        examParticipationRepository,
      }),
    );

    const result = await service.getAccessState('open-midterm', 'user-1');

    expect(examEntrySessionRepository.createOrResumeVerifiedSession).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      participantId: 'participant-1',
      entrySessionId: 'entry-session-started',
      entrySessionStatus: 'started',
      participationId: 'participation-1',
    });
  });

  it('rejects OTP verification when the email already belongs to a real user account', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        accessMode: 'open_registration',
        status: 'published',
        endDate: new Date('2026-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: null,
        normalizedEmail: 'student@example.com',
        source: 'self_registration',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      }),
      bindUser: jest.fn().mockResolvedValue(undefined),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'student@example.com',
      }),
      createUser: jest.fn(),
    } as any;
    const examEntrySessionRepository = {
      createOrResumeVerifiedSession: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        expiresAt: new Date('2026-05-03T12:00:00.000Z'),
      }),
    } as any;
    const emailService = {
      verifyOTP: jest.fn().mockResolvedValue(true),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository,
        examEntrySessionRepository,
        emailService,
        tokenRepository,
      }),
    );

    await expect(
      service.verifyOtp('spring-midterm', {
        email: 'student@example.com',
        otp: '123456',
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);

    expect(userRepository.createUser).not.toHaveBeenCalled();
    expect(examParticipantRepository.bindUser).not.toHaveBeenCalled();
  });

  it('reuses the canonical shadow user when a concurrent create races on the same email', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        accessMode: 'open_registration',
        status: 'published',
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const participant = {
      id: 'participant-1',
      examId: 'exam-1',
      userId: null,
      normalizedEmail: 'shadow@example.com',
      fullName: 'Shadow Candidate',
      source: 'self_registration',
      approvalStatus: 'approved',
      accessStatus: 'eligible',
    };
    const canonicalUser = {
      id: 'user-shadow-1',
      email: 'shadow@example.com',
      role: 'user',
      isShadowAccount: true,
    };
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue(participant),
      bindUser: jest.fn().mockResolvedValue({ ...participant, userId: canonicalUser.id }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
      markJoined: jest.fn().mockResolvedValue(undefined),
    } as any;
    const userRepository = {
      findByEmail: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(canonicalUser),
      createUser: jest.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint')),
    } as any;
    const examEntrySessionRepository = {
      createOrResumeVerifiedSession: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        expiresAt: new Date('2099-05-03T12:00:00.000Z'),
      }),
    } as any;
    const tokenRepository = {
      createRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        userRepository,
        examEntrySessionRepository,
        tokenRepository,
        emailService: {
          verifyOTP: jest.fn().mockResolvedValue(true),
        },
      }),
    );

    const result = await service.verifyOtp('spring-midterm', {
      email: 'shadow@example.com',
      otp: '123456',
    });

    expect(userRepository.createUser).toHaveBeenCalledTimes(1);
    expect(examParticipantRepository.bindUser).toHaveBeenCalledWith(
      'participant-1',
      canonicalUser.id,
    );
    expect(result).toMatchObject({
      participantId: 'participant-1',
      accessStatus: 'eligible',
    });
  });

  it('does not auto-create an entry session for invite-only participants who have not opened an invite', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'invite-only-midterm',
        title: 'Invite Only Midterm',
        accessMode: 'invite_only',
        selfRegistrationApprovalMode: null,
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2026-04-01T07:00:00.000Z'),
        endDate: new Date('2026-04-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        normalizedEmail: 'student@example.com',
        source: 'manual_add',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      }),
    } as any;
    const examEntrySessionRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue(null),
      createOrResumeVerifiedSession: jest.fn(),
    } as any;
    const examParticipationRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue(null),
      countAttemptsByParticipant: jest.fn().mockResolvedValue(0),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examEntrySessionRepository,
        examParticipationRepository,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'student@example.com',
            isShadowAccount: false,
          }),
        },
      }),
    );

    const result = await service.getAccessState('invite-only-midterm', 'user-1');

    expect(examEntrySessionRepository.createOrResumeVerifiedSession).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      participantId: 'participant-1',
      accessStatus: 'invited',
      entrySessionId: null,
      entrySessionStatus: null,
      canStart: false,
    });
  });

  it('rejects OTP requests for invite-only participants unless they first open a valid invite link', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'invite-only-midterm',
        accessMode: 'invite_only',
        status: 'published',
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: null,
        normalizedEmail: 'student@example.com',
        source: 'manual_add',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      }),
    } as any;
    const examEntrySessionRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue(null),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examEntrySessionRepository,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.sendOtp('invite-only-midterm', {
        email: 'student@example.com',
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);
  });

  it('returns a login-required invite resolution for internal participants opening the link anonymously', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'invite-only-midterm',
        accessMode: 'invite_only',
        status: 'published',
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examInviteRepository = {
      findByTokenHash: jest.fn().mockResolvedValue({
        id: 'invite-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date('2099-05-01T12:00:00.000Z'),
      }),
      markOpened: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        normalizedEmail: 'student@example.com',
        fullName: 'Exam Student',
        source: 'manual_add',
        approvalStatus: 'approved',
        accessStatus: 'invited',
      }),
    } as any;
    const examEntrySessionRepository = {
      createOrResumeOpenedSession: jest.fn().mockResolvedValue({
        id: 'entry-1',
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examInviteRepository,
        examParticipantRepository,
        examEntrySessionRepository,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'student@example.com',
            isShadowAccount: false,
          }),
        },
      }),
    );

    const result = await service.resolveInvite('invite-only-midterm', {
      inviteToken: 'invite-token',
      userId: null,
    });

    expect(result).toMatchObject({
      participantId: 'participant-1',
      entrySessionId: 'entry-1',
      requiresLogin: true,
      requiresOtp: false,
    });
  });

  it('marks expired entry sessions and writes an audit log when access-state is queried lazily', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        title: 'Spring Midterm',
        accessMode: 'open_registration',
        selfRegistrationApprovalMode: 'auto',
        selfRegistrationPasswordRequired: false,
        allowExternalCandidates: true,
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2026-04-01T09:00:00.000Z'),
        endDate: new Date('2026-04-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        normalizedEmail: 'student@example.com',
        source: 'self_registration',
        approvalStatus: 'approved',
        accessStatus: 'eligible',
      }),
    } as any;
    const examEntrySessionRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'eligible',
        expiresAt: new Date('2026-04-01T08:59:00.000Z'),
      }),
      markExpired: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        status: 'expired',
        expiresAt: new Date('2026-04-01T08:59:00.000Z'),
      }),
    } as any;
    const examParticipationRepository = {
      findLatestByParticipant: jest.fn().mockResolvedValue(null),
      countAttemptsByParticipant: jest.fn().mockResolvedValue(0),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examEntrySessionRepository,
        examParticipationRepository,
        examAuditLogRepository,
      }),
    );

    const result = await service.getAccessState('spring-midterm', 'user-1');

    expect(examEntrySessionRepository.markExpired).toHaveBeenCalledWith('entry-session-1');
    expect(examAuditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        actorType: 'system',
        action: 'auto_expire_session',
        targetId: 'entry-session-1',
      }),
    );
    expect(result.entrySessionStatus).toBe('expired');
  });

  it('enforces OTP resend cooldown with a rate-limit exception', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-cooldown',
        slug: 'cooldown-midterm',
        accessMode: 'open_registration',
        status: 'published',
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-cooldown',
        examId: 'exam-cooldown',
        userId: null,
        normalizedEmail: 'cooldown@example.com',
        source: 'self_registration',
        approvalStatus: 'approved',
        accessStatus: 'eligible',
      }),
    } as any;
    const emailService = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        emailService,
        userRepository: {
          findByEmail: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await service.sendOtp('cooldown-midterm', {
      email: 'cooldown@example.com',
      ipAddress: '127.0.0.1',
    });

    await expect(
      service.sendOtp('cooldown-midterm', {
        email: 'cooldown@example.com',
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(RateLimitExceededException);
  });

  it('rejects starting an entry session before the exam start time even if the client calls the endpoint directly', async () => {
    const examEntrySessionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'entry-session-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        participationId: null,
        status: 'eligible',
        expiresAt: new Date('2026-05-03T10:30:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
        accessStatus: 'eligible',
      }),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        status: 'published',
        duration: 90,
        maxAttempts: 1,
        startDate: new Date('2099-05-01T09:00:00.000Z'),
        endDate: new Date('2099-05-01T12:00:00.000Z'),
      }),
    } as any;
    const examParticipationRepository = {
      countAttemptsByParticipant: jest.fn().mockResolvedValue(0),
      createAttempt: jest.fn(),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examEntrySessionRepository,
        examParticipantRepository,
        examRepository,
        examParticipationRepository,
      }),
    );

    await expect(service.startEntrySession('entry-session-1', 'user-1')).rejects.toBeInstanceOf(
      ExamNotStartedException,
    );
    expect(examParticipationRepository.createAttempt).not.toHaveBeenCalled();
  });

  it('rejects sync requests when the participant access status is revoked', async () => {
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        currentAnswers: {
          challengeA: { code: 'print(1)' },
        },
        expiresAt: new Date('2099-05-01T10:30:00.000Z'),
      }),
      updateParticipation: jest.fn(),
    } as any;
    const examParticipantRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        accessStatus: 'revoked',
      }),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examParticipationRepository,
        examParticipantRepository,
      }),
    );

    await expect(
      service.syncParticipation('user-1', {
        participationId: 'participation-1',
        answers: {
          challengeA: { code: 'print(2)' },
        },
      }),
    ).rejects.toBeInstanceOf(AuthorizationException);
    expect(examParticipationRepository.updateParticipation).not.toHaveBeenCalled();
  });
});
