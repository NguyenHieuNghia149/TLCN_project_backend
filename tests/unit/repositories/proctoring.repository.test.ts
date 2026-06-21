function loadRepositories() {
  return {
    ProctoringEventRepository: require('@backend/api/repositories/proctoring/proctoringEvent.repository')
      .ProctoringEventRepository,
    ProctoringFinalFlushRepository:
      require('@backend/api/repositories/proctoring/proctoringFinalFlush.repository')
        .ProctoringFinalFlushRepository,
  };
}

describe('ProctoringEventRepository', () => {
  it('bulk inserts events with the participation/client-session/client-seq dedupe key', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'event-1' }]);
    const onConflictDoNothing = jest.fn(() => ({ returning }));
    const values = jest.fn(() => ({ onConflictDoNothing }));
    const insert = jest.fn(() => ({ values }));
    const { ProctoringEventRepository } = loadRepositories();
    const repository = new ProctoringEventRepository({ insert } as any);

    const result = await repository.bulkInsertDedupe([
      {
        examId: 'exam-1',
        participationId: 'participation-1',
        sessionId: 'session-1',
        candidateUserId: 'user-1',
        clientSessionId: 'client-session-1',
        clientSeq: 1,
        type: 'heartbeat',
        severity: 'info',
        schemaVersion: 1,
        payloadJson: { ok: true },
        capturedAt: new Date('2026-06-11T01:00:00.000Z'),
        receivedAt: new Date('2026-06-11T01:00:01.000Z'),
      },
      {
        examId: 'exam-1',
        participationId: 'participation-1',
        sessionId: 'session-1',
        candidateUserId: 'user-1',
        clientSessionId: 'client-session-1',
        clientSeq: 1,
        type: 'heartbeat',
        severity: 'info',
        schemaVersion: 1,
        payloadJson: { duplicate: true },
        capturedAt: new Date('2026-06-11T01:00:00.000Z'),
        receivedAt: new Date('2026-06-11T01:00:01.000Z'),
      },
    ] as any);

    expect(values).toHaveBeenCalledTimes(1);
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.arrayContaining([
        expect.objectContaining({ name: 'participation_id' }),
        expect.objectContaining({ name: 'client_session_id' }),
        expect.objectContaining({ name: 'client_seq' }),
      ]),
    });
    expect(result).toMatchObject({
      insertedCount: 1,
      dedupedCount: 1,
    });
  });
});

describe('ProctoringFinalFlushRepository', () => {
  it('transitions final flush status only through the requested status machine step', async () => {
    const persistedAt = new Date('2026-06-11T01:00:05.000Z');
    const returning = jest.fn().mockResolvedValue([{ id: 'receipt-1', status: 'persisted' }]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    const update = jest.fn(() => ({ set }));
    const { ProctoringFinalFlushRepository } = loadRepositories();
    const repository = new ProctoringFinalFlushRepository({ update } as any);

    const result = await repository.transitionStatus({
      receiptId: 'receipt-1',
      fromStatuses: ['received', 'persisting'],
      toStatus: 'persisted',
      persistedAt,
      counts: {
        acceptedCount: 2,
        dedupedCount: 1,
        persistedCount: 1,
      },
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'persisted',
        acceptedCount: 2,
        dedupedCount: 1,
        persistedCount: 1,
        persistedAt,
      }),
    );
    expect(where).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'receipt-1', status: 'persisted' });
  });
});
