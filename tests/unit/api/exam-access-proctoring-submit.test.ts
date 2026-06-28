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

describe('ExamAccessService proctoring submit guard', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('polls the final-flush receipt every 500ms until persisted', async () => {
    const {
      ProctoringSubmitGuardService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');
    const finalFlushRepository = {
      findByParticipationAndSubmitAttempt: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'receipt-1',
          status: 'received',
        })
        .mockResolvedValueOnce({
          id: 'receipt-1',
          status: 'persisting',
        })
        .mockResolvedValueOnce({
          id: 'receipt-1',
          status: 'persisted',
        }),
      transitionStatus: jest.fn().mockResolvedValue(undefined),
    };
    const sleep = jest.fn().mockResolvedValue(undefined);
    const guard = new ProctoringSubmitGuardService({
      finalFlushRepository,
      sleep,
    });

    const result = await guard.awaitFinalFlushReceipt({
      participationId: 'participation-1',
      submitAttemptId: 'submit-1',
      finalFlushReceiptId: 'receipt-1',
    });

    expect(finalFlushRepository.findByParticipationAndSubmitAttempt).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(result).toEqual({
      status: 'persisted',
      receiptId: 'receipt-1',
    });
  });

  it('records a timeout after five seconds when the receipt stays in flight', async () => {
    const {
      ProctoringSubmitGuardService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');
    const finalFlushRepository = {
      findByParticipationAndSubmitAttempt: jest.fn().mockResolvedValue({
        id: 'receipt-1',
        status: 'received',
      }),
      transitionStatus: jest.fn().mockResolvedValue(undefined),
    };
    const summaryService = {
      recomputeForParticipation: jest.fn().mockResolvedValue({ id: 'summary-1' }),
    };
    const sleep = jest.fn().mockResolvedValue(undefined);
    const guard = new ProctoringSubmitGuardService({
      finalFlushRepository,
      summaryService,
      sleep,
    });

    const result = await guard.awaitFinalFlushReceipt({
      participationId: 'participation-1',
      submitAttemptId: 'submit-1',
      finalFlushReceiptId: 'receipt-1',
    });

    expect(finalFlushRepository.findByParticipationAndSubmitAttempt).toHaveBeenCalledTimes(10);
    expect(finalFlushRepository.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: 'receipt-1',
        toStatus: 'timeout',
      })
    );
    expect(summaryService.recomputeForParticipation).toHaveBeenCalledWith({
      participationId: 'participation-1',
      finalFlushStatus: 'timeout',
    });
    expect(result).toEqual({
      status: 'timeout',
      receiptId: 'receipt-1',
    });
  });

  it('waits for a persisted final-flush receipt before finalizing submit', async () => {
    const proctoringSubmitGuardService = {
      awaitFinalFlushReceipt: jest.fn().mockResolvedValue({
        status: 'persisted',
        receiptId: 'receipt-1',
      }),
    };
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        maxAttempts: 1,
        endDate: new Date('2026-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      findByParticipantId: jest.fn().mockResolvedValue([
        {
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          currentAnswers: {},
          lastSyncedAt: null,
        },
      ]),
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        currentAnswers: {},
        lastSyncedAt: null,
      }),
      submitActiveParticipation: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'SUBMITTED',
        currentAnswers: {},
        submittedAt: new Date('2026-06-11T10:00:00.000Z'),
        scoreStatus: 'pending',
      }),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examParticipationRepository,
        examAuditLogRepository,
        proctoringSubmitGuardService,
      })
    );

    const result = await (service as any).submitActiveParticipation('spring-midterm', 'user-1', {
      submitAttemptId: 'submit-1',
      finalFlushReceiptId: 'receipt-1',
    });

    expect(proctoringSubmitGuardService.awaitFinalFlushReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        participationId: 'participation-1',
        submitAttemptId: 'submit-1',
        finalFlushReceiptId: 'receipt-1',
      })
    );
    expect(examParticipationRepository.submitActiveParticipation).toHaveBeenCalledWith(
      'participation-1',
      expect.objectContaining({
        scoreStatus: 'pending',
      })
    );
    expect(result).toMatchObject({
      participationId: 'participation-1',
      scoreStatus: 'pending',
    });
  });

  it('continues submit after a final-flush timeout is recorded', async () => {
    const proctoringSubmitGuardService = {
      awaitFinalFlushReceipt: jest.fn().mockResolvedValue({
        status: 'timeout',
        receiptId: 'receipt-1',
      }),
    };
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        maxAttempts: 1,
        endDate: new Date('2026-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      findByParticipantId: jest.fn().mockResolvedValue([
        {
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          currentAnswers: {},
          lastSyncedAt: null,
        },
      ]),
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        currentAnswers: {},
        lastSyncedAt: null,
      }),
      submitActiveParticipation: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'SUBMITTED',
        currentAnswers: {},
        submittedAt: new Date('2026-06-11T10:00:00.000Z'),
        scoreStatus: 'pending',
      }),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examParticipationRepository,
        examAuditLogRepository,
        proctoringSubmitGuardService,
      })
    );

    const result = await (service as any).submitActiveParticipation('spring-midterm', 'user-1', {
      submitAttemptId: 'submit-1',
      finalFlushReceiptId: 'receipt-1',
    });

    expect(proctoringSubmitGuardService.awaitFinalFlushReceipt).toHaveBeenCalledTimes(1);
    expect(examParticipationRepository.submitActiveParticipation).toHaveBeenCalledWith(
      'participation-1',
      expect.objectContaining({
        scoreStatus: 'pending',
      })
    );
    expect(result).toMatchObject({
      participationId: 'participation-1',
    });
  });

  it('returns the same finalization result for duplicate submit attempts on the same participation', async () => {
    const proctoringSubmitGuardService = {
      awaitFinalFlushReceipt: jest.fn().mockResolvedValue({
        status: 'persisted',
        receiptId: 'receipt-1',
      }),
    };
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        maxAttempts: 1,
        endDate: new Date('2026-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest
        .fn()
        .mockResolvedValue({
          id: 'participant-1',
          examId: 'exam-1',
          userId: 'user-1',
        })
        .mockResolvedValueOnce({
          id: 'participant-1',
          examId: 'exam-1',
          userId: 'user-1',
        }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      findByParticipantId: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'participation-1',
            participantId: 'participant-1',
            userId: 'user-1',
            status: 'IN_PROGRESS',
            currentAnswers: {},
            lastSyncedAt: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'participation-1',
            participantId: 'participant-1',
            userId: 'user-1',
            status: 'SUBMITTED',
            submittedAt: new Date('2026-06-11T10:00:01.000Z'),
            currentAnswers: {},
          },
        ]),
      findById: jest.fn().mockResolvedValueOnce({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        currentAnswers: {},
        lastSyncedAt: null,
      }),
      submitActiveParticipation: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'SUBMITTED',
        currentAnswers: {},
        submittedAt: new Date('2026-06-11T10:00:01.000Z'),
        scoreStatus: 'pending',
      }),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examParticipationRepository,
        examAuditLogRepository,
        proctoringSubmitGuardService,
      })
    );

    const first = await (service as any).submitActiveParticipation('spring-midterm', 'user-1', {
      submitAttemptId: 'submit-1',
      finalFlushReceiptId: 'receipt-1',
    });
    const second = await (service as any).submitActiveParticipation('spring-midterm', 'user-1', {
      submitAttemptId: 'submit-1',
      finalFlushReceiptId: 'receipt-1',
    });

    expect(examParticipationRepository.submitActiveParticipation).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('retries submit with the latest synced answers when a sync lands between reload and finalize', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        maxAttempts: 1,
        endDate: new Date('2026-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      findByParticipantId: jest.fn().mockResolvedValue([
        {
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          currentAnswers: {
            challengeA: {
              sourceCode: 'print(\"old\")',
              language: 'python',
              updatedAt: '2026-06-11T09:59:00.000Z',
            },
          },
          lastSyncedAt: null,
        },
      ]),
      findById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          currentAnswers: {
            challengeA: {
              sourceCode: 'print(\"old\")',
              language: 'python',
              updatedAt: '2026-06-11T09:59:00.000Z',
            },
          },
          lastSyncedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          currentAnswers: {
            challengeA: {
              sourceCode: 'print(\"synced\")',
              language: 'python',
              updatedAt: '2026-06-11T10:00:30.000Z',
            },
          },
          lastSyncedAt: new Date('2026-06-11T10:00:30.000Z'),
        }),
      submitActiveParticipation: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'SUBMITTED',
          currentAnswers: {
            challengeA: {
              sourceCode: 'print(\"final\")',
              language: 'python',
              updatedAt: '2026-06-11T10:01:00.000Z',
            },
          },
          submittedAt: new Date('2026-06-11T10:01:00.000Z'),
          scoreStatus: 'pending',
        }),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examParticipationRepository,
        examAuditLogRepository,
      })
    );

    const result = await (service as any).submitActiveParticipation('spring-midterm', 'user-1', {
      answers: {
        challengeA: {
          sourceCode: 'print(\"final\")',
          language: 'python',
          updatedAt: '2026-06-11T10:01:00.000Z',
        },
      },
    });

    expect(examParticipationRepository.submitActiveParticipation).toHaveBeenNthCalledWith(
      1,
      'participation-1',
      expect.objectContaining({
        expectedLastSyncedAt: null,
        submittedAnswersSnapshot: {
          challengeA: {
            sourceCode: 'print("final")',
            language: 'python',
            updatedAt: '2026-06-11T10:01:00.000Z',
          },
        },
      }),
    );
    expect(examParticipationRepository.submitActiveParticipation).toHaveBeenNthCalledWith(
      2,
      'participation-1',
      expect.objectContaining({
        expectedLastSyncedAt: new Date('2026-06-11T10:00:30.000Z'),
        submittedAnswersSnapshot: {
          challengeA: {
            sourceCode: 'print("final")',
            language: 'python',
            updatedAt: '2026-06-11T10:01:00.000Z',
          },
        },
      }),
    );
    expect(result).toMatchObject({
      participationId: 'participation-1',
      scoreStatus: 'pending',
    });
  });

  it('does not let timestamp-less submit answers overwrite fresher persisted answers', async () => {
    const examRepository = {
      findBySlug: jest.fn().mockResolvedValue({
        id: 'exam-1',
        slug: 'spring-midterm',
        maxAttempts: 1,
        endDate: new Date('2026-06-11T12:00:00.000Z'),
      }),
    } as any;
    const examParticipantRepository = {
      findByExamAndIdentity: jest.fn().mockResolvedValue({
        id: 'participant-1',
        examId: 'exam-1',
        userId: 'user-1',
      }),
      updateAccessStatus: jest.fn().mockResolvedValue(undefined),
    } as any;
    const examParticipationRepository = {
      findByParticipantId: jest.fn().mockResolvedValue([
        {
          id: 'participation-1',
          participantId: 'participant-1',
          userId: 'user-1',
          status: 'IN_PROGRESS',
          currentAnswers: {
            challengeA: {
              sourceCode: 'print("fresh-server")',
              language: 'python',
              updatedAt: '2026-06-11T10:02:00.000Z',
            },
          },
          lastSyncedAt: new Date('2026-06-11T10:02:00.000Z'),
        },
      ]),
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'IN_PROGRESS',
        currentAnswers: {
          challengeA: {
            sourceCode: 'print("fresh-server")',
            language: 'python',
            updatedAt: '2026-06-11T10:02:00.000Z',
          },
        },
        lastSyncedAt: new Date('2026-06-11T10:02:00.000Z'),
      }),
      submitActiveParticipation: jest.fn().mockResolvedValue({
        id: 'participation-1',
        participantId: 'participant-1',
        userId: 'user-1',
        status: 'SUBMITTED',
        currentAnswers: {
          challengeA: {
            sourceCode: 'print("fresh-server")',
            language: 'python',
            updatedAt: '2026-06-11T10:02:00.000Z',
          },
        },
        submittedAnswersSnapshot: {
          challengeA: {
            sourceCode: 'print("fresh-server")',
            language: 'python',
            updatedAt: '2026-06-11T10:02:00.000Z',
          },
        },
        submittedAt: new Date('2026-06-11T10:03:00.000Z'),
        scoreStatus: 'pending',
      }),
    } as any;
    const examAuditLogRepository = {
      create: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new ExamAccessService(
      createDependencies({
        examRepository,
        examParticipantRepository,
        examParticipationRepository,
        examAuditLogRepository,
      })
    );

    await (service as any).submitActiveParticipation('spring-midterm', 'user-1', {
      answers: {
        challengeA: {
          sourceCode: 'print("stale-client")',
          language: 'python',
        },
      },
    });

    expect(examParticipationRepository.submitActiveParticipation).toHaveBeenCalledWith(
      'participation-1',
      expect.objectContaining({
        submittedAnswersSnapshot: {
          challengeA: {
            sourceCode: 'print("fresh-server")',
            language: 'python',
            updatedAt: '2026-06-11T10:02:00.000Z',
          },
        },
      }),
    );
  });
});
