import {
  createExamAutoSubmitService,
  ExamAutoSubmitService,
  IExamAutoSubmitService,
  IExpiredParticipationFinalizer,
} from '../../../apps/api/src/services/exam-auto-submit.service';

describe('ExamAutoSubmitService', () => {
  let service: IExamAutoSubmitService | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }

    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('calls the finalizer immediately when started', async () => {
    const examFinalizer: IExpiredParticipationFinalizer = {
      finalizeExpiredParticipations: jest.fn().mockResolvedValue(0),
    };
    service = new ExamAutoSubmitService({ examFinalizer });

    await service.start();

    expect(examFinalizer.finalizeExpiredParticipations).toHaveBeenCalledTimes(1);
  });

  it('runs the finalizer again when the interval elapses', async () => {
    const examFinalizer: IExpiredParticipationFinalizer = {
      finalizeExpiredParticipations: jest.fn().mockResolvedValue(0),
    };
    service = new ExamAutoSubmitService({ examFinalizer });

    await service.start();
    await jest.advanceTimersByTimeAsync(30000);

    expect(examFinalizer.finalizeExpiredParticipations).toHaveBeenCalledTimes(2);
  });

  it('does not create duplicate intervals when started twice', async () => {
    const examFinalizer: IExpiredParticipationFinalizer = {
      finalizeExpiredParticipations: jest.fn().mockResolvedValue(0),
    };
    service = new ExamAutoSubmitService({ examFinalizer });

    await service.start();
    await service.start();
    await jest.advanceTimersByTimeAsync(30000);

    expect(examFinalizer.finalizeExpiredParticipations).toHaveBeenCalledTimes(2);
  });

  it('clears the interval and resets status when stopped', async () => {
    const examFinalizer: IExpiredParticipationFinalizer = {
      finalizeExpiredParticipations: jest.fn().mockResolvedValue(0),
    };
    service = new ExamAutoSubmitService({ examFinalizer });

    await service.start();

    expect(service.getStatus()).toEqual({ isRunning: true, checkInterval: 30000 });

    await service.stop();
    await jest.advanceTimersByTimeAsync(30000);

    expect(service.getStatus()).toEqual({ isRunning: false, checkInterval: null });
    expect(examFinalizer.finalizeExpiredParticipations).toHaveBeenCalledTimes(1);
  });

  it('creates an exam auto-submit service instance with the expected interface', () => {
    service = createExamAutoSubmitService();

    expect(typeof service.start).toBe('function');
    expect(typeof service.stop).toBe('function');
    expect(typeof service.getStatus).toBe('function');
    expect(service.getStatus()).toEqual({ isRunning: false, checkInterval: null });
  });
});
