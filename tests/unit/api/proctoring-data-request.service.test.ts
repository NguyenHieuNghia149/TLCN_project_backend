describe('ProctoringDataRequestService', () => {
  const loadService = () =>
    require('@backend/api/services/proctoring/proctoring-data-request.service');

  it('records the internal 72 hour target when creating a request', async () => {
    jest.resetModules();
    const dataRequestRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'request-1',
      }),
      findById: jest.fn(),
      findByParticipation: jest.fn(),
      updateStatus: jest.fn(),
    };
    const consentRepository = {
      findByParticipation: jest.fn().mockResolvedValue([]),
    };
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
    };
    const proctoringAiJobRepository = {
      deleteByParticipation: jest.fn(),
      findByParticipation: jest.fn(),
      updateStatus: jest.fn(),
    };
    const { ProctoringDataRequestService } = loadService();
    const service = new ProctoringDataRequestService({
      dataRequestRepository,
      consentRepository,
      examParticipationRepository,
      proctoringAiJobRepository,
    });

    const result = await service.createDataRequest('participation-1', 'user-1', {
      requestType: 'delete',
      statutoryDueAt: '2026-06-15T00:00:00.000Z',
      now: new Date('2026-06-11T00:00:00.000Z'),
    } as any);

    expect(dataRequestRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        internalTargetDueAt: new Date('2026-06-14T00:00:00.000Z'),
        requestType: 'delete',
      }),
    );
    expect(result).toMatchObject({ id: 'request-1' });
  });

  it('persists cleanup result details for deleted proctoring data', async () => {
    jest.resetModules();
    const deletedTables: string[] = [];
    const db = {
      transaction: jest.fn(async (handler: (tx: any) => Promise<unknown>) =>
        handler({
          delete: jest.fn(() => ({
            where: jest.fn(async () => {
              deletedTables.push('table');
              return { rowCount: 1 };
            }),
          })),
          update: jest.fn(),
        }),
      ),
    };
    const dataRequestRepository = {
      insert: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'request-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        candidateUserId: 'user-1',
        requestType: 'delete',
        status: 'requested',
      }),
      findByParticipation: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({
        id: 'request-1',
        status: 'completed',
      }),
    };
    const consentRepository = {
      findByParticipation: jest.fn().mockResolvedValue([]),
    };
    const examParticipationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
    };
    const proctoringAiJobRepository = {
      deleteByParticipation: jest.fn(),
      findByParticipation: jest.fn(),
      updateStatus: jest.fn(),
    };
    const { ProctoringDataRequestService } = loadService();
    const service = new ProctoringDataRequestService({
      db,
      dataRequestRepository,
      consentRepository,
      examParticipationRepository,
      proctoringAiJobRepository,
    });

    const result = await service.executeDataRequestCleanup('request-1', {
      actorType: 'system',
      actorId: 'system',
    });

    expect(dataRequestRepository.updateStatus).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        status: 'completed',
        resultJson: expect.objectContaining({
          tablesTouched: expect.any(Array),
          startedAt: expect.any(String),
          completedAt: expect.any(String),
        }),
      }),
    );
    expect(result.status).toBe('completed');
  });
});
