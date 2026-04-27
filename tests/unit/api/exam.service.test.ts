import { createExamService, ExamService } from '../../../apps/api/src/services/exam.service';
import { PasswordUtils } from '@backend/shared/utils';
import { InvalidPasswordException } from '../../../apps/api/src/exceptions/exam.exceptions';

/** Builds a dependency bag for ExamService tests with optional overrides. */
function createExamDependencies(overrides: Partial<any> = {}) {
  return {
    examRepository: {} as any,
    examToProblemsRepository: {} as any,
    examParticipationRepository: {} as any,
    problemRepository: {} as any,
    submissionRepository: {} as any,
    testcaseRepository: {} as any,
    resultSubmissionRepository: {} as any,
    userRepository: {} as any,
    challengeService: {} as any,
    getNotificationPublisher: jest.fn(() => ({
      notifyAllUsers: jest.fn().mockResolvedValue(undefined),
    })),
    ...overrides,
  };
}

describe('ExamService dependency injection', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('does not resolve the notification provider at construction time', () => {
    const getNotificationPublisher = jest.fn();

    new ExamService(createExamDependencies({ getNotificationPublisher }));

    expect(getNotificationPublisher).not.toHaveBeenCalled();
  });

  it('notifies lazily when a created exam is visible', async () => {
    const notifyAllUsers = jest.fn().mockResolvedValue(undefined);
    const getNotificationPublisher = jest.fn(() => ({ notifyAllUsers }));
    const examRepository = {
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, getNotificationPublisher }),
    );
    const setImmediateSpy = jest
      .spyOn(global, 'setImmediate')
      .mockImplementation(((callback: (...args: any[]) => void, ...args: any[]) => {
        callback(...args);
        return {} as any;
      }) as any);

    jest.spyOn(service, 'getExamById').mockResolvedValue({
      id: 'exam-1',
      title: 'Visible Exam',
      startDate: '2025-01-01T00:00:00.000Z',
      isVisible: true,
    } as any);

    await service.createExam({
      title: 'Visible Exam',
      password: 'secret',
      duration: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-01T01:00:00.000Z',
      isVisible: true,
      maxAttempts: 1,
      challenges: [],
    } as any);
    await Promise.resolve();

    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
    expect(getNotificationPublisher).toHaveBeenCalledTimes(1);
    expect(notifyAllUsers).toHaveBeenCalledTimes(1);
  });

  it('does not resolve the notification provider for hidden exams', async () => {
    const getNotificationPublisher = jest.fn(() => ({
      notifyAllUsers: jest.fn().mockResolvedValue(undefined),
    }));
    const examRepository = {
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, getNotificationPublisher }),
    );
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');

    jest.spyOn(service, 'getExamById').mockResolvedValue({
      id: 'exam-1',
      title: 'Hidden Exam',
      startDate: '2025-01-01T00:00:00.000Z',
      isVisible: false,
    } as any);

    await service.createExam({
      title: 'Hidden Exam',
      password: 'secret',
      duration: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-01T01:00:00.000Z',
      isVisible: false,
      maxAttempts: 1,
      challenges: [],
    } as any);

    expect(setImmediateSpy).not.toHaveBeenCalled();
    expect(getNotificationPublisher).not.toHaveBeenCalled();
  });

  it('uses the injected challenge service when loading an exam challenge', async () => {
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([{ problemId: 'challenge-1', orderIndex: 2 }]),
    } as any;
    const challengeService = {
      getChallengeById: jest.fn().mockResolvedValue({
        problem: { id: 'challenge-1', title: 'Two Sum' },
        testcases: [],
        solution: null,
      }),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examToProblemsRepository, challengeService }),
    );

    const result = await service.getExamChallenge('exam-1', 'challenge-1', 'user-1');

    expect(examToProblemsRepository.findByExamId).toHaveBeenCalledWith('exam-1');
    expect(challengeService.getChallengeById).toHaveBeenCalledWith('challenge-1', 'user-1', {
      allowPrivateVisibility: true,
      showAllTestcases: false,
    });
    expect(result).toMatchObject({
      id: 'challenge-1',
      title: 'Two Sum',
      orderIndex: 2,
    });
  });

  it('uses the injected user repository when loading participation submission details', async () => {
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        startTime: new Date('2025-01-01T00:00:00.000Z'),
        endTime: new Date('2025-01-01T00:30:00.000Z'),
      }),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'exam-1' }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      }),
    } as any;
    const service = new ExamService(
      createExamDependencies({
        examParticipationRepository,
        examRepository,
        examToProblemsRepository,
        userRepository,
      }),
    );

    const result = await service.getParticipationSubmission(
      'exam-1',
      'participation-1',
      'user-1',
    );

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(result.user).toEqual({
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
    });
  });

  it('creates a fresh exam service instance', () => {
    const service = createExamService();

    expect(service).toBeInstanceOf(ExamService);
  });

  it('returns slug in legacy getExamById payload for frontend slug routing', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        title: 'Spring Midterm',
        duration: 60,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-01-01T01:00:00.000Z'),
        isVisible: true,
        maxAttempts: 1,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, examToProblemsRepository }),
    );

    const result = await service.getExamById('exam-1');

    expect(result.slug).toBe('spring-midterm');
  });

  it('returns slug in legacy getExams list payload for learner links', async () => {
    const examRepository = {
      getExamsPaginated: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'exam-1',
            slug: 'spring-midterm',
            title: 'Spring Midterm',
            duration: 60,
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            endDate: new Date('2025-01-01T01:00:00.000Z'),
            isVisible: true,
            maxAttempts: 1,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
        total: 1,
      }),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));

    const result = await service.getExams(10, 0, undefined, 'all', undefined, true);

    expect(result.total).toBe(1);
    expect(result.data[0]?.slug).toBe('spring-midterm');
  });

  it('limits visible learner exam lists to published exams', async () => {
    const examRepository = {
      getExamsPaginated: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));

    await service.getExams(10, 0, undefined, 'all', undefined, true, 'user');

    expect(examRepository.getExamsPaginated).toHaveBeenCalledWith(
      10,
      0,
      expect.objectContaining({
        isVisible: true,
        status: 'published',
      }),
    );
  });

  it('returns null from getMyParticipation when user has no in-progress participation', async () => {
    const examParticipationRepository = {
      findInProgressByExamAndUser: jest.fn().mockResolvedValue(null),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examParticipationRepository }),
    );

    const result = await service.getMyParticipation('exam-1', 'user-1');

    expect(examParticipationRepository.findInProgressByExamAndUser).toHaveBeenCalledWith(
      'exam-1',
      'user-1',
    );
    expect(result).toBeNull();
  });

  it('returns active participation from getMyParticipation when status is IN_PROGRESS', async () => {
    const examParticipationRepository = {
      findInProgressByExamAndUser: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        userId: 'user-1',
        startTime: new Date('2025-01-01T00:00:00.000Z'),
        expiresAt: new Date('2025-01-01T01:00:00.000Z'),
        endTime: null,
        status: 'IN_PROGRESS',
      }),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examParticipationRepository }),
    );

    const result = await service.getMyParticipation('exam-1', 'user-1');

    expect(result).toMatchObject({
      id: 'participation-1',
      examId: 'exam-1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
    });
  });
});

describe('ExamService exam password storage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('hashes exam password before persisting exam record', async () => {
    const examRepository = {
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));
    const hashSpy = jest
      .spyOn(PasswordUtils, 'hashPassword')
      .mockResolvedValue('hashed-exam-password');

    jest.spyOn(service, 'getExamById').mockResolvedValue({
      id: 'exam-1',
      title: 'Exam',
      duration: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-01T01:00:00.000Z',
      isVisible: false,
      maxAttempts: 1,
      challenges: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    } as any);

    await service.createExam({
      title: 'Exam',
      password: 'plain-password',
      duration: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-01T01:00:00.000Z',
      isVisible: false,
      maxAttempts: 1,
      challenges: [],
    } as any);

    expect(hashSpy).toHaveBeenCalledWith('plain-password');
    expect(examRepository.createExamWithChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: 'hashed-exam-password',
      }),
      expect.any(Array),
    );
    expect(examRepository.createExamWithChallenges).toHaveBeenCalledWith(
      expect.not.objectContaining({
        password: expect.anything(),
      }),
      expect.any(Array),
    );
  });

  it('validates exam join password against passwordHash', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60 * 60_000),
        duration: 60,
        maxAttempts: 2,
        passwordHash: await PasswordUtils.hashPassword('correct-password'),
      }),
    } as any;
    const examParticipationRepository = {
      findAllByExamAndUser: jest.fn().mockResolvedValue([]),
      createExamParticipationWithExpiry: jest.fn().mockResolvedValue([
        {
          id: 'participation-1',
          startTime: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2025-01-01T01:00:00.000Z'),
        },
      ]),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, examParticipationRepository }),
    );

    await expect(service.joinExam('exam-1', 'user-1', 'wrong-password')).rejects.toBeInstanceOf(
      InvalidPasswordException,
    );

    await expect(
      service.joinExam('exam-1', 'user-1', 'correct-password'),
    ).resolves.toMatchObject({
      participationId: 'participation-1',
      duration: 60,
    });
  });
});
