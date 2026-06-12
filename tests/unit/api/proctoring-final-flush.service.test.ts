describe('ProctoringFinalFlushService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('creates a final-flush receipt and appends enriched telemetry for persistence', async () => {
    const {
      ProctoringFinalFlushService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-final-flush.service');

    const participationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
        userId: 'candidate-1',
      }),
    };
    const sessionRepository = {
      findActiveByParticipationAndClientSession: jest.fn().mockResolvedValue({
        id: 'session-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        candidateUserId: 'candidate-1',
        entrySessionId: 'entry-1',
        clientSessionId: 'client-1',
      }),
    };
    const finalFlushRepository = {
      upsertReceipt: jest.fn().mockResolvedValue({
        id: 'receipt-1',
        status: 'received',
      }),
    };
    const redisService = {
      appendTelemetryEvent: jest.fn().mockResolvedValue({
        streamKey: 'proctoring:telemetry:stream:0',
        redisId: '1-0',
      }),
    };

    const service = new ProctoringFinalFlushService({
      participationRepository,
      sessionRepository,
      finalFlushRepository,
      redisService,
    });

    const result = await service.submitFinalFlush(
      'participation-1',
      'candidate-1',
      {
        clientSessionId: 'client-1',
        submitAttemptId: 'attempt-1',
        expectedEventCount: 1,
        firstClientSeq: 4,
        lastClientSeq: 4,
        events: [
          {
            type: 'telemetry.batch',
            participationId: 'participation-1',
            clientSessionId: 'client-1',
            clientSeq: 4,
            capturedAt: '2026-06-12T10:00:00.000Z',
            receivedAt: '2026-06-12T10:00:00.000Z',
            schemaVersion: 1,
            severity: 'info',
            payloadJson: {
              eventName: 'paste',
              textLength: 10,
              rawClipboardText: 'secret',
            },
          },
        ],
      }
    );

    expect(finalFlushRepository.upsertReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        participationId: 'participation-1',
        sessionId: 'session-1',
        clientSessionId: 'client-1',
        submitAttemptId: 'attempt-1',
        status: 'received',
        expectedEventCount: 1,
        firstClientSeq: 4,
        lastClientSeq: 4,
      })
    );
    expect(redisService.appendTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        shard: 0,
        event: expect.objectContaining({
          examId: 'exam-1',
          participationId: 'participation-1',
          sessionId: 'session-1',
          candidateUserId: 'candidate-1',
          clientSessionId: 'client-1',
          clientSeq: 4,
          finalFlushReceiptId: 'receipt-1',
          payloadJson: { eventName: 'paste', textLength: 10 },
        }),
      })
    );
    expect(result).toEqual({
      receiptId: 'receipt-1',
      status: 'received',
    });
  });
});
