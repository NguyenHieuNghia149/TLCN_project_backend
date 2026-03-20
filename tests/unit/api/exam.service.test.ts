import { ExamService } from '../../../apps/api/src/services/exam.service';

describe('ExamService notification provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('does not resolve the notification provider at construction time', () => {
    const notificationProvider = jest.fn();

    new ExamService(notificationProvider as any);

    expect(notificationProvider).not.toHaveBeenCalled();
  });

  it('notifies lazily when a created exam is visible', async () => {
    const notifyAllUsers = jest.fn().mockResolvedValue(undefined);
    const notificationProvider = jest.fn(() => ({ notifyAllUsers }));
    const service = new ExamService(notificationProvider);
    const setImmediateSpy = jest
      .spyOn(global, 'setImmediate')
      .mockImplementation(((callback: (...args: any[]) => void, ...args: any[]) => {
        callback(...args);
        return {} as any;
      }) as any);

    (service as any).examRepository = {
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    };
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
    expect(notificationProvider).toHaveBeenCalledTimes(1);
    expect(notifyAllUsers).toHaveBeenCalledTimes(1);
  });

  it('does not resolve the notification provider for hidden exams', async () => {
    const notificationProvider = jest.fn(() => ({ notifyAllUsers: jest.fn() }));
    const service = new ExamService(notificationProvider);
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');

    (service as any).examRepository = {
      createExamWithChallenges: jest.fn().mockResolvedValue('exam-1'),
    };
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
    expect(notificationProvider).not.toHaveBeenCalled();
  });
});
