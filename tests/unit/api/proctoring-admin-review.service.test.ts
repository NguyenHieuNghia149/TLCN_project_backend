describe('ProctoringAdminReviewService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function createService(overrides: Partial<any> = {}) {
    const {
      ProctoringAdminReviewService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-admin-review.service');

    const summaryRepository = {
      findByParticipation: jest.fn().mockResolvedValue({
        id: 'summary-1',
        examId: 'exam-1',
        participationId: 'participation-1',
        riskScore: 42,
        riskLevel: 'medium',
        eventCountsJson: { paste: 1 },
        velocityJson: { perMinute: 1 },
        finalFlushStatus: 'persisted',
        deterministicSchemaVersion: 'phase-1-deterministic-risk-v1',
        computedAt: new Date('2026-06-12T10:00:00.000Z'),
        reviewerDecision: 'pending',
      }),
      updateReviewerDecision: jest.fn().mockResolvedValue({
        id: 'summary-1',
        reviewerDecision: 'no_action',
      }),
    };
    const eventRepository = {
      findByParticipation: jest.fn().mockResolvedValue([
        {
          id: 'event-1',
          type: 'telemetry.batch',
          severity: 'info',
          capturedAt: new Date('2026-06-12T10:00:00.000Z'),
          clientSeq: 1,
          payloadJson: { eventName: 'paste', textLength: 12 },
        },
        {
          id: 'event-2',
          type: 'telemetry.batch',
          severity: 'warning',
          capturedAt: new Date('2026-06-12T10:01:00.000Z'),
          clientSeq: 2,
          payloadJson: { eventName: 'focus_lost' },
        },
      ]),
    };
    const consentRepository = {
      findByParticipation: jest.fn().mockResolvedValue([{ id: 'consent-1', status: 'accepted' }]),
    };
    const precheckRepository = {
      findByParticipation: jest.fn().mockResolvedValue([{ id: 'precheck-1', passed: true }]),
    };
    const bypassRepository = {
      findByParticipation: jest.fn().mockResolvedValue([{ id: 'bypass-1', status: 'used' }]),
    };
    const finalFlushRepository = {
      findByParticipation: jest.fn().mockResolvedValue([{ id: 'receipt-1', status: 'persisted' }]),
    };
    const dataRequestRepository = {
      findByParticipation: jest.fn().mockResolvedValue([{ id: 'request-1', requestType: 'delete' }]),
    };
    const summaryService = {
      recomputeForParticipation: jest.fn().mockResolvedValue({
        id: 'summary-1',
        reviewerDecision: 'pending',
      }),
    };
    const auditLogRepository = {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const examRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'exam-1',
        createdBy: 'teacher-1',
      }),
    };
    const participationRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'participation-1',
        examId: 'exam-1',
      }),
    };

    const service = new ProctoringAdminReviewService({
      examRepository,
      participationRepository,
      summaryRepository,
      eventRepository,
      consentRepository,
      precheckRepository,
      bypassRepository,
      finalFlushRepository,
      dataRequestRepository,
      summaryService,
      auditLogRepository,
      ...overrides,
    });

    return {
      service,
      examRepository,
      participationRepository,
      summaryRepository,
      eventRepository,
      auditLogRepository,
      summaryService,
    };
  }

  it('returns deterministic summary, filtered timeline, and evidence without AI output', async () => {
    const { service, eventRepository } = createService();

    const result = await service.getReview(
      'exam-1',
      'participation-1',
      {
        userId: 'teacher-1',
        role: 'teacher',
      },
      {
        eventName: 'paste',
        limit: 5,
        offset: 0,
      }
    );

    expect(eventRepository.findByParticipation).toHaveBeenCalledWith(
      'participation-1',
      expect.objectContaining({ limit: 1000 })
    );
    expect(result.summary).toMatchObject({
      riskScore: 42,
      riskLevel: 'medium',
      reviewerDecision: 'pending',
    });
    expect(result.timeline.items).toEqual([
      expect.objectContaining({
        id: 'event-1',
        eventName: 'paste',
        payloadJson: { eventName: 'paste', textLength: 12 },
      }),
    ]);
    expect(result.evidence).toMatchObject({
      consent: [{ id: 'consent-1', status: 'accepted' }],
      precheck: [{ id: 'precheck-1', passed: true }],
      bypass: [{ id: 'bypass-1', status: 'used' }],
      finalFlush: [{ id: 'receipt-1', status: 'persisted' }],
      dataRequests: [{ id: 'request-1', requestType: 'delete' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/aiResult|aiScore|llm/i);
  });

  it('recomputes deterministic risk without resetting the reviewer decision by default', async () => {
    const { service, summaryService } = createService();

    await service.recompute(
      'exam-1',
      'participation-1',
      {
        userId: 'teacher-1',
        role: 'teacher',
      },
      {}
    );

    expect(summaryService.recomputeForParticipation).toHaveBeenCalledWith({
      participationId: 'participation-1',
      reviewPolicy: { needsReReview: false },
    });
  });

  it('stores human review decision and writes an audit event', async () => {
    const { service, summaryRepository, auditLogRepository } = createService();

    const result = await service.recordReviewDecision(
      'exam-1',
      'participation-1',
      {
        userId: 'reviewer-1',
        role: 'owner',
      },
      {
        decision: 'no_action',
        notes: 'Evidence reviewed.',
      }
    );

    expect(summaryRepository.updateReviewerDecision).toHaveBeenCalledWith({
      participationId: 'participation-1',
      reviewerDecision: 'no_action',
      reviewerId: 'reviewer-1',
      reviewerNotes: 'Evidence reviewed.',
      reviewedAt: expect.any(Date),
    });
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        actorId: 'reviewer-1',
        action: 'proctoring_review_decision',
        targetType: 'exam_participation',
        targetId: 'participation-1',
        metadata: expect.objectContaining({ decision: 'no_action' }),
      })
    );
    expect(result).toMatchObject({ reviewerDecision: 'no_action' });
  });

  it('rejects a teacher who did not create the exam', async () => {
    const { service, eventRepository } = createService({
      examRepository: {
        findById: jest.fn().mockResolvedValue({
          id: 'exam-1',
          createdBy: 'teacher-owner',
        }),
      },
    });

    await expect(
      service.getReview('exam-1', 'participation-1', {
        userId: 'other-teacher',
        role: 'teacher',
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PROCTORING_REVIEW_FORBIDDEN',
    });
    expect(eventRepository.findByParticipation).not.toHaveBeenCalled();
  });

  it('rejects mismatched exam and participation before reading evidence', async () => {
    const { service, eventRepository } = createService({
      summaryRepository: {
        findByParticipation: jest.fn().mockResolvedValue(null),
        updateReviewerDecision: jest.fn(),
      },
      participationRepository: {
        findById: jest.fn().mockResolvedValue({
          id: 'participation-1',
          examId: 'other-exam',
        }),
      },
    });

    await expect(
      service.getReview('exam-1', 'participation-1', {
        userId: 'teacher-1',
        role: 'teacher',
      })
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'PROCTORING_REVIEW_NOT_FOUND',
    });
    expect(eventRepository.findByParticipation).not.toHaveBeenCalled();
  });
});
