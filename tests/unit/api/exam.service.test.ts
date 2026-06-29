import { createExamService, ExamService } from '../../../apps/api/src/services/exam.service';
import {
  ExamParticipationNotFoundException,
  ExamTimeoutException,
  InvalidPasswordException,
} from '../../../apps/api/src/exceptions/exam.exceptions';

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
    jest.useRealTimers();
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
      findBySlug: jest.fn().mockResolvedValue(null),
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
      findBySlug: jest.fn().mockResolvedValue(null),
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
        solution: {
          id: 'solution-1',
          description: 'Do not expose this during an exam.',
        },
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
      solution: null,
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
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        duration: 60,
        endDate: new Date('2025-01-01T01:00:00.000Z'),
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const submissionRepository = {
      findLatestByParticipationAndProblems: jest.fn().mockResolvedValue([]),
      findLatestByUserProblemsBetween: jest.fn().mockResolvedValue([]),
    } as any;
    const testcaseRepository = {
      findByProblemIds: jest.fn().mockResolvedValue([]),
    } as any;
    const resultSubmissionRepository = {
      findBySubmissionIds: jest.fn().mockResolvedValue([]),
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
        submissionRepository,
        testcaseRepository,
        resultSubmissionRepository,
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

  it('falls back to exam participant identity when the linked user record is missing', async () => {
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-missing',
        startTime: new Date('2025-01-01T00:00:00.000Z'),
        endTime: new Date('2025-01-01T00:30:00.000Z'),
      }),
      findParticipantProfileByParticipationId: jest.fn().mockResolvedValue({
        fullName: 'External Candidate',
        normalizedEmail: 'external@example.com',
      }),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        duration: 60,
        endDate: new Date('2025-01-01T01:00:00.000Z'),
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([]),
    } as any;
    const submissionRepository = {
      findLatestByParticipationAndProblems: jest.fn().mockResolvedValue([]),
      findLatestByUserProblemsBetween: jest.fn().mockResolvedValue([]),
    } as any;
    const testcaseRepository = {
      findByProblemIds: jest.fn().mockResolvedValue([]),
    } as any;
    const resultSubmissionRepository = {
      findBySubmissionIds: jest.fn().mockResolvedValue([]),
    } as any;
    const userRepository = {
      findById: jest.fn().mockResolvedValue(null),
    } as any;
    const service = new ExamService(
      createExamDependencies({
        examParticipationRepository,
        examRepository,
        examToProblemsRepository,
        submissionRepository,
        testcaseRepository,
        resultSubmissionRepository,
        userRepository,
      }),
    );

    const result = await service.getParticipationSubmission(
      'exam-1',
      'participation-1',
      'user-missing',
    );

    expect(userRepository.findById).toHaveBeenCalledWith('user-missing');
    expect(
      examParticipationRepository.findParticipantProfileByParticipationId,
    ).toHaveBeenCalledWith('participation-1');
    expect(result.user).toEqual({
      firstname: 'External Candidate',
      lastname: '',
      email: 'external@example.com',
    });
  });

  it('includes per-challenge max points in learner submission details', async () => {
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        startTime: new Date('2025-01-01T00:00:00.000Z'),
        endTime: new Date('2025-01-01T00:30:00.000Z'),
      }),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        duration: 60,
        endDate: new Date('2025-01-01T01:00:00.000Z'),
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([
        { problemId: 'problem-1' },
        { problemId: 'problem-2' },
      ]),
    } as any;
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      }),
    } as any;
    const problemRepository = {
      findById: jest
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve({ id, title: id === 'problem-1' ? 'Arrays' : 'DP' }),
        ),
    } as any;
    const testcaseRepository = {
      findByProblemIds: jest.fn().mockResolvedValue([
        { id: 'tc-1', problemId: 'problem-1', point: 30 },
        { id: 'tc-2', problemId: 'problem-1', point: 70 },
        { id: 'tc-3', problemId: 'problem-2', point: 10 },
        { id: 'tc-4', problemId: 'problem-2', point: 15 },
      ]),
      findByProblemId: jest.fn().mockImplementation((problemId: string) =>
        Promise.resolve(
          problemId === 'problem-1'
            ? [
                { id: 'tc-1', point: 30 },
                { id: 'tc-2', point: 70 },
              ]
            : [
                { id: 'tc-3', point: 10 },
                { id: 'tc-4', point: 15 },
              ],
        ),
      ),
    } as any;
    const submissionRepository = {
      findLatestByParticipationAndProblems: jest.fn().mockResolvedValue([
        {
          id: 'submission-1',
          problemId: 'problem-1',
          sourceCode: 'print("ok")',
          language: 'python',
          submittedAt: new Date('2025-01-01T00:10:00.000Z'),
        },
      ]),
      findLatestByUserProblemsBetween: jest.fn().mockResolvedValue([]),
      findLatestByParticipationAndProblem: jest
        .fn()
        .mockImplementation((_participationId: string, problemId: string) =>
          Promise.resolve(
            problemId === 'problem-1'
              ? {
                  id: 'submission-1',
                  sourceCode: 'print("ok")',
                  language: 'python',
                  submittedAt: new Date('2025-01-01T00:10:00.000Z'),
                }
              : null,
          ),
        ),
    } as any;
    const resultSubmissionRepository = {
      findBySubmissionIds: jest.fn().mockResolvedValue([
        { submissionId: 'submission-1', testcaseId: 'tc-1', isPassed: true },
        { submissionId: 'submission-1', testcaseId: 'tc-2', isPassed: false },
      ]),
      findBySubmissionId: jest.fn().mockResolvedValue([
        { testcaseId: 'tc-1', isPassed: true },
        { testcaseId: 'tc-2', isPassed: false },
      ]),
    } as any;
    const service = new ExamService(
      createExamDependencies({
        examParticipationRepository,
        examRepository,
        examToProblemsRepository,
        userRepository,
        problemRepository,
        testcaseRepository,
        submissionRepository,
        resultSubmissionRepository,
      }),
    );

    const result = await service.getParticipationSubmission(
      'exam-1',
      'participation-1',
      'user-1',
    );

    expect(result.totalScore).toBe(30);
    expect(result.totalMaxScore).toBe(125);
    expect(result.perProblem).toEqual([
      {
        problemId: 'problem-1',
        challengeTitle: 'Arrays',
        obtained: 30,
        maxPoints: 100,
      },
      {
        problemId: 'problem-2',
        challengeTitle: 'DP',
        obtained: 0,
        maxPoints: 25,
      },
    ]);
    expect(result.solutions).toEqual([
      expect.objectContaining({
        challengeId: 'problem-1',
        challengeTitle: 'Arrays',
        score: 30,
        maxPoints: 100,
      }),
      expect.objectContaining({
        challengeId: 'problem-2',
        challengeTitle: 'DP',
        score: 0,
        maxPoints: 25,
      }),
    ]);
  });

  it('falls back to time-window submissions when loading participation submission details', async () => {
    const startedAt = new Date('2025-01-01T00:00:00.000Z');
    const fallbackSubmittedAt = new Date('2025-01-01T00:12:00.000Z');
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        startTime: startedAt,
        endTime: new Date('2025-01-01T00:30:00.000Z'),
      }),
    } as any;
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        duration: 60,
        endDate: new Date('2025-01-01T01:00:00.000Z'),
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([{ problemId: 'problem-1' }]),
    } as any;
    const userRepository = {
      findById: jest.fn().mockResolvedValue({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      }),
    } as any;
    const problemRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'problem-1', title: 'Arrays' }),
    } as any;
    const testcaseRepository = {
      findByProblemIds: jest
        .fn()
        .mockResolvedValue([{ id: 'tc-1', problemId: 'problem-1', point: 25 }]),
    } as any;
    const submissionRepository = {
      findLatestByParticipationAndProblems: jest.fn().mockResolvedValue([]),
      findLatestByUserProblemsBetween: jest.fn().mockResolvedValue([
        {
          id: 'submission-fallback-1',
          problemId: 'problem-1',
          sourceCode: 'print("fallback")',
          language: 'python',
          submittedAt: fallbackSubmittedAt,
        },
      ]),
    } as any;
    const resultSubmissionRepository = {
      findBySubmissionIds: jest.fn().mockResolvedValue([
        {
          submissionId: 'submission-fallback-1',
          testcaseId: 'tc-1',
          isPassed: true,
        },
      ]),
    } as any;
    const service = new ExamService(
      createExamDependencies({
        examParticipationRepository,
        examRepository,
        examToProblemsRepository,
        userRepository,
        problemRepository,
        testcaseRepository,
        submissionRepository,
        resultSubmissionRepository,
      }),
    );

    const result = await service.getParticipationSubmission(
      'exam-1',
      'participation-1',
      'user-1',
    );

    expect(submissionRepository.findLatestByUserProblemsBetween).toHaveBeenCalledWith(
      'user-1',
      ['problem-1'],
      startedAt,
      new Date('2025-01-01T01:00:00.000Z'),
    );
    expect(resultSubmissionRepository.findBySubmissionIds).toHaveBeenCalledWith([
      'submission-fallback-1',
    ]);
    expect(result.solutions).toEqual([
      expect.objectContaining({
        challengeId: 'problem-1',
        challengeTitle: 'Arrays',
        code: 'print("fallback")',
        language: 'python',
        score: 25,
        maxPoints: 25,
        submittedAt: fallbackSubmittedAt.toISOString(),
      }),
    ]);
    expect(result.totalScore).toBe(25);
  });

  it('uses time-window submissions when building the exam leaderboard fallback', async () => {
    const startedAt = new Date('2025-01-01T00:00:00.000Z');
    const submittedAt = new Date('2025-01-01T00:20:00.000Z');
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        duration: 60,
        endDate: new Date('2025-01-01T01:00:00.000Z'),
      }),
    } as any;
    const examParticipationRepository = {
      getExamLeaderboard: jest.fn().mockResolvedValue([
        {
          participationId: 'participation-1',
          userId: 'user-1',
          startTime: startedAt,
          submittedAt,
          normalizedEmail: 'jane@example.com',
        },
      ]),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([{ problemId: 'problem-1' }]),
    } as any;
    const testcaseRepository = {
      findByProblemId: jest.fn().mockResolvedValue([{ id: 'tc-1', point: 25 }]),
    } as any;
    const submissionRepository = {
      findLatestByParticipationAndProblem: jest.fn().mockResolvedValue(null),
      findLatestByUserProblemBetween: jest.fn().mockResolvedValue({ id: 'submission-1' }),
    } as any;
    const resultSubmissionRepository = {
      findBySubmissionId: jest.fn().mockResolvedValue([{ testcaseId: 'tc-1', isPassed: true }]),
    } as any;
    const service = new ExamService(
      createExamDependencies({
        examRepository,
        examParticipationRepository,
        examToProblemsRepository,
        testcaseRepository,
        submissionRepository,
        resultSubmissionRepository,
      }),
    );

    const result = await service.getExamLeaderboard('exam-1');

    expect(submissionRepository.findLatestByUserProblemBetween).toHaveBeenCalledWith(
      'user-1',
      'problem-1',
      startedAt,
      new Date('2025-01-01T01:00:00.000Z'),
    );
    expect(result).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        totalScore: 25,
      }),
    ]);
  });

  it('scores final exam submissions in one batch while preferring participation submissions', async () => {
    const startedAt = new Date('2025-01-01T00:00:00.000Z');
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        duration: 60,
        endDate: new Date('2025-01-01T01:00:00.000Z'),
      }),
    } as any;
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        startTime: startedAt,
      }),
    } as any;
    const examToProblemsRepository = {
      findByExamId: jest.fn().mockResolvedValue([
        { problemId: 'problem-a' },
        { problemId: 'problem-b' },
        { problemId: 'problem-c' },
      ]),
    } as any;
    const submissionRepository = {
      findLatestByParticipationAndProblems: jest.fn().mockResolvedValue([
        { id: 'sub-a-participation', problemId: 'problem-a' },
        { id: 'sub-c-participation', problemId: 'problem-c' },
      ]),
      findLatestByUserProblemsBetween: jest.fn().mockResolvedValue([
        { id: 'sub-b-fallback', problemId: 'problem-b' },
        { id: 'sub-c-fallback', problemId: 'problem-c' },
      ]),
      findLatestByParticipationAndProblem: jest.fn().mockImplementation((_participationId, problemId) =>
        Promise.resolve(
          problemId === 'problem-a'
            ? { id: 'sub-a-participation', problemId: 'problem-a' }
            : problemId === 'problem-c'
              ? { id: 'sub-c-participation', problemId: 'problem-c' }
              : null,
        ),
      ),
      findLatestByUserProblemBetween: jest.fn().mockImplementation((_userId, problemId) =>
        Promise.resolve(
          problemId === 'problem-b'
            ? { id: 'sub-b-fallback', problemId: 'problem-b' }
            : problemId === 'problem-c'
              ? { id: 'sub-c-fallback', problemId: 'problem-c' }
              : null,
        ),
      ),
    } as any;
    const testcaseRepository = {
      findByProblemIds: jest.fn().mockResolvedValue([
        { id: 'tc-a', problemId: 'problem-a', point: 10 },
        { id: 'tc-b', problemId: 'problem-b', point: 20 },
        { id: 'tc-c', problemId: 'problem-c', point: 30 },
      ]),
      findByProblemId: jest.fn().mockImplementation((problemId: string) =>
        Promise.resolve([{ id: `tc-${problemId.slice(-1)}`, problemId, point: problemId === 'problem-a' ? 10 : problemId === 'problem-b' ? 20 : 30 }]),
      ),
    } as any;
    const resultSubmissionRepository = {
      findBySubmissionIds: jest.fn().mockResolvedValue([
        { submissionId: 'sub-a-participation', testcaseId: 'tc-a', isPassed: true },
        { submissionId: 'sub-b-fallback', testcaseId: 'tc-b', isPassed: true },
        { submissionId: 'sub-c-fallback', testcaseId: 'tc-c', isPassed: false },
        { submissionId: 'sub-c-participation', testcaseId: 'tc-c', isPassed: true },
      ]),
      findBySubmissionId: jest.fn().mockImplementation((submissionId: string) =>
        Promise.resolve(
          submissionId === 'sub-a-participation'
            ? [{ submissionId, testcaseId: 'tc-a', isPassed: true }]
            : submissionId === 'sub-b-fallback'
              ? [{ submissionId, testcaseId: 'tc-b', isPassed: true }]
              : submissionId === 'sub-c-participation'
                ? [{ submissionId, testcaseId: 'tc-c', isPassed: true }]
                : [{ submissionId, testcaseId: 'tc-c', isPassed: false }],
        ),
      ),
    } as any;
    const service = new ExamService(
      createExamDependencies({
        examRepository,
        examParticipationRepository,
        examToProblemsRepository,
        submissionRepository,
        testcaseRepository,
        resultSubmissionRepository,
      }),
    );

    const score = await (service as any).calculateExamScore(
      'participation-1',
      'exam-1',
      'user-1',
    );

    expect(score).toBe(60);
    expect(submissionRepository.findLatestByParticipationAndProblems).toHaveBeenCalledTimes(1);
    expect(submissionRepository.findLatestByParticipationAndProblems).toHaveBeenCalledWith(
      'participation-1',
      ['problem-a', 'problem-b', 'problem-c'],
    );
    expect(submissionRepository.findLatestByUserProblemsBetween).toHaveBeenCalledTimes(1);
    expect(submissionRepository.findLatestByUserProblemsBetween).toHaveBeenCalledWith(
      'user-1',
      ['problem-a', 'problem-b', 'problem-c'],
      startedAt,
      new Date('2025-01-01T01:00:00.000Z'),
    );
    expect(resultSubmissionRepository.findBySubmissionIds).toHaveBeenCalledTimes(1);
    expect(resultSubmissionRepository.findBySubmissionIds).toHaveBeenCalledWith([
      'sub-b-fallback',
      'sub-c-participation',
      'sub-a-participation',
    ]);
    expect(testcaseRepository.findByProblemIds).toHaveBeenCalledTimes(1);
    expect(testcaseRepository.findByProblemIds).toHaveBeenCalledWith([
      'problem-a',
      'problem-b',
      'problem-c',
    ]);
  });

  it('syncs session answers through the narrow sync state shape', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:05:00.000Z'));
    const examParticipationRepository = {
      findSyncStateById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2025-01-01T00:30:00.000Z'),
        currentAnswers: {
          problemA: {
            code: 'old',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        },
      }),
      updateSyncState: jest.fn().mockResolvedValue(true),
    } as any;
    const service = new ExamService(createExamDependencies({ examParticipationRepository }));

    const result = await service.syncSession('participation-1', {
      problemA: {
        code: 'new',
        updatedAt: '2025-01-01T00:04:00.000Z',
      },
      problemB: {
        code: 'answer',
      },
    });

    expect(result).toBe(true);
    expect(examParticipationRepository.findSyncStateById).toHaveBeenCalledWith('participation-1');
    expect(examParticipationRepository.updateSyncState).toHaveBeenCalledWith('participation-1', {
      currentAnswers: {
        problemA: {
          code: 'new',
          updatedAt: '2025-01-01T00:04:00.000Z',
        },
        problemB: {
          code: 'answer',
        },
      },
      lastSyncedAt: new Date('2025-01-01T00:05:00.000Z'),
    });
    jest.useRealTimers();
  });

  it('removes stale session answers when sync receives a deletion tombstone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:05:00.000Z'));
    const examParticipationRepository = {
      findSyncStateById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2025-01-01T00:30:00.000Z'),
        currentAnswers: {
          problemA: {
            sourceCode: 'starter-code',
            language: 'javascript',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
          problemB: {
            sourceCode: 'real-answer',
            language: 'python',
            updatedAt: '2025-01-01T00:01:00.000Z',
          },
        },
      }),
      updateSyncState: jest.fn().mockResolvedValue(true),
    } as any;
    const service = new ExamService(createExamDependencies({ examParticipationRepository }));

    await service.syncSession('participation-1', {
      problemA: {
        deleted: true,
        updatedAt: '2025-01-01T00:04:00.000Z',
      },
    });

    expect(examParticipationRepository.updateSyncState).toHaveBeenCalledWith('participation-1', {
      currentAnswers: {
        problemB: {
          sourceCode: 'real-answer',
          language: 'python',
          updatedAt: '2025-01-01T00:01:00.000Z',
        },
      },
      lastSyncedAt: new Date('2025-01-01T00:05:00.000Z'),
    });
    jest.useRealTimers();
  });

  it('throws when sync state is missing', async () => {
    const examParticipationRepository = {
      findSyncStateById: jest.fn().mockResolvedValue(null),
      updateSyncState: jest.fn(),
    } as any;
    const service = new ExamService(createExamDependencies({ examParticipationRepository }));

    await expect(service.syncSession('missing-participation', {})).rejects.toBeInstanceOf(
      ExamParticipationNotFoundException,
    );
    expect(examParticipationRepository.updateSyncState).not.toHaveBeenCalled();
  });

  it('throws timeout when syncing an expired session', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:31:00.000Z'));
    const examParticipationRepository = {
      findSyncStateById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2025-01-01T00:30:00.000Z'),
        currentAnswers: {},
      }),
      updateSyncState: jest.fn(),
    } as any;
    const service = new ExamService(createExamDependencies({ examParticipationRepository }));

    await expect(service.syncSession('participation-1', {})).rejects.toBeInstanceOf(
      ExamTimeoutException,
    );
    expect(examParticipationRepository.updateSyncState).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('returns false when sync state update affects no rows', async () => {
    const examParticipationRepository = {
      findSyncStateById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        expiresAt: new Date('2999-01-01T00:30:00.000Z'),
        currentAnswers: {},
      }),
      updateSyncState: jest.fn().mockResolvedValue(false),
    } as any;
    const service = new ExamService(createExamDependencies({ examParticipationRepository }));

    await expect(service.syncSession('participation-1', {})).resolves.toBe(false);
  });

  it('only scans exams with active participations when finalizing expirations', async () => {
    const startTime = new Date('2025-01-01T00:00:00.000Z');
    const endDate = new Date('2025-01-01T02:00:00.000Z');
    const examData = {
      id: 'exam-1',
      duration: 60,
      endDate,
    };
    const participation = {
      id: 'participation-1',
      examId: 'exam-1',
      startTime,
      status: 'IN_PROGRESS',
    };
    const examRepository = {
      getExamsWithIncompleteParticipations: jest.fn().mockResolvedValue([examData]),
      getAllExams: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(examData),
    } as any;
    const examParticipationRepository = {
      findIncompleteParticipations: jest.fn().mockResolvedValue([participation]),
      findById: jest.fn().mockResolvedValue(participation),
      updateParticipation: jest.fn().mockResolvedValue(participation),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, examParticipationRepository }),
    );

    const finalized = await service.finalizeExpiredParticipations();

    expect(examRepository.getExamsWithIncompleteParticipations).toHaveBeenCalledTimes(1);
    expect(examRepository.getAllExams).not.toHaveBeenCalled();
    expect(examParticipationRepository.updateParticipation).toHaveBeenCalledWith(
      'participation-1',
      expect.objectContaining({ status: 'EXPIRED' }),
    );
    expect(finalized).toBe(1);
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

  it('includes private or archived exams only in an authenticated participated list', async () => {
    const examRepository = {
      getExamsPaginated: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
    } as any;
    const examParticipationRepository = {
      findByUserId: jest.fn().mockResolvedValue([
        {
          examId: 'archived-exam-1',
          status: 'SUBMITTED',
          startTime: new Date('2025-01-01T00:10:00.000Z'),
        },
      ]),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, examParticipationRepository }),
    );

    await service.getExams(10, 0, undefined, 'participated', 'user-1', true, 'user');

    expect(examRepository.getExamsPaginated).toHaveBeenCalledWith(
      10,
      0,
      expect.objectContaining({
        examIds: ['archived-exam-1'],
        statuses: ['published', 'archived'],
      }),
    );
    const options = examRepository.getExamsPaginated.mock.calls[0]?.[2];
    expect(options).not.toHaveProperty('isVisible');
    expect(options).not.toHaveProperty('status');
    expect(options).not.toHaveProperty('excludeInviteOnly');
  });

  it('includes learner participation state in getExams list payload', async () => {
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
            maxAttempts: 2,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
        total: 1,
      }),
    } as any;
    const examParticipationRepository = {
      findByUserId: jest.fn(),
      findByUserIdAndExamIds: jest.fn().mockResolvedValue([
        {
          id: 'participation-1',
          examId: 'exam-1',
          status: 'SUBMITTED',
          startTime: new Date('2025-01-01T00:10:00.000Z'),
          endTime: new Date('2025-01-01T00:40:00.000Z'),
        },
      ]),
    } as any;
    const service = new ExamService(
      createExamDependencies({ examRepository, examParticipationRepository }),
    );

    const result = await service.getExams(10, 0, undefined, 'all', 'user-1', true, 'user');

    expect(examParticipationRepository.findByUserIdAndExamIds).toHaveBeenCalledWith('user-1', [
      'exam-1',
    ]);
    expect(examParticipationRepository.findByUserId).not.toHaveBeenCalled();
    expect(result.data[0]).toMatchObject({
      attemptsUsed: 1,
      latestParticipationStatus: 'SUBMITTED',
      hasInProgressParticipation: false,
      hasCompletedParticipation: true,
    });
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

  it('stores the exam password as registrationPassword when creating an exam', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue(null),
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));

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

    expect(examRepository.createExamWithChallenges).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationPassword: 'plain-password',
      }),
      expect.any(Array),
    );
    expect(examRepository.createExamWithChallenges).toHaveBeenCalledWith(
      expect.not.objectContaining({
        password: expect.anything(),
        passwordHash: expect.anything(),
      }),
      expect.any(Array),
    );
  });

  it('generates a bounded slug for legacy exam create when slug is absent', async () => {
    const longTitle = `${'Midterm Final! '.repeat(40)}###`;
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue(null),
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));

    jest.spyOn(service, 'getExamById').mockResolvedValue({
      id: 'exam-1',
      title: longTitle,
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
      title: longTitle,
      password: 'plain-password',
      duration: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-01T01:00:00.000Z',
      isVisible: false,
      maxAttempts: 1,
      challenges: [],
    } as any);

    const createInput = examRepository.createExamWithChallenges.mock.calls[0]?.[0];
    expect(createInput.slug).toMatch(/^midterm-final.*-[a-f0-9]{6}$/);
    expect(createInput.slug.length).toBeLessThanOrEqual(255);
    expect(examRepository.findBySlug).toHaveBeenCalledWith(createInput.slug);
  });

  it('retries generated legacy exam slugs when candidates collide', async () => {
    const examRepository = {
      findBySlug: jest
        .fn()
        .mockResolvedValueOnce({ id: 'existing-exam' })
        .mockResolvedValueOnce(null),
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));

    jest.spyOn(service, 'getExamById').mockResolvedValue({
      id: 'exam-1',
      title: 'Midterm Final!',
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
      title: 'Midterm Final!',
      password: 'plain-password',
      duration: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-01T01:00:00.000Z',
      isVisible: false,
      maxAttempts: 1,
      challenges: [],
    } as any);

    expect(examRepository.findBySlug).toHaveBeenCalledTimes(2);
    expect(examRepository.createExamWithChallenges.mock.calls[0]?.[0].slug).toMatch(
      /^midterm-final-[a-f0-9]{6}$/
    );
  });

  it('stops legacy exam slug generation after five collisions', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({ id: 'existing-exam' }),
      createExamWithChallenges: jest.fn(),
    } as any;
    const service = new ExamService(createExamDependencies({ examRepository }));

    await expect(
      service.createExam({
        title: 'Midterm Final!',
        password: 'plain-password',
        duration: 60,
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-01T01:00:00.000Z',
        isVisible: false,
        maxAttempts: 1,
        challenges: [],
      } as any)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'EXAM_SLUG_GENERATION_CONFLICT',
    });

    expect(examRepository.findBySlug).toHaveBeenCalledTimes(5);
    expect(examRepository.createExamWithChallenges).not.toHaveBeenCalled();
  });

  it('validates exam join password against registrationPassword', async () => {
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60 * 60_000),
        duration: 60,
        maxAttempts: 2,
        registrationPassword: 'correct-password',
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
