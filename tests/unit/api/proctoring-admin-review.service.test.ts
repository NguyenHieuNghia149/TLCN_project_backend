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
        eventCountsJson: { clipboard_event: 1 },
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
          payloadJson: { eventName: 'clipboard_event', action: 'paste', textLength: 12 },
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
    const reviewLabelRepository = {
      upsertReviewerLabel: jest.fn().mockImplementation(async values => ({
        id: 'label-1',
        ...values,
      })),
      findByParticipation: jest.fn().mockResolvedValue([]),
    };
    const settingsRepository = {
      findByExamId: jest.fn().mockResolvedValue({
        aiShadowMode: true,
        aiAdvisoryVisible: false,
        aiMinimumEvaluationStatus: 'passed_gate',
      }),
    };
    const anomalyResultRepository = {
      findLatestByParticipation: jest.fn().mockResolvedValue([]),
    };
    const evaluationReportRepository = {
      findLatestForModel: jest.fn().mockResolvedValue(null),
    };
    const llmSummaryRepository = {
      findLatestByParticipation: jest.fn().mockResolvedValue(null),
    };
    const summaryService = {
      recomputeForParticipation: jest.fn().mockResolvedValue({
        id: 'summary-1',
        reviewerDecision: 'pending',
      }),
    };
    const aiJobService = {
      enqueueManualRecomputeWindow: jest.fn().mockResolvedValue({
        id: 'ai-job-1',
      }),
    };
    const modelRegistryService = {
      resolveAnomalyModel: jest.fn().mockResolvedValue({
        modelVersion: 'iforest-v1',
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
      reviewLabelRepository,
      settingsRepository,
      anomalyResultRepository,
      evaluationReportRepository,
      llmSummaryRepository,
      summaryService,
      aiJobService,
      modelRegistryService,
      auditLogRepository,
      ...overrides,
    });

    return {
      service,
      examRepository,
      participationRepository,
      summaryRepository,
      eventRepository,
      reviewLabelRepository,
      settingsRepository,
      anomalyResultRepository,
      evaluationReportRepository,
      llmSummaryRepository,
      auditLogRepository,
      summaryService,
      aiJobService,
      modelRegistryService,
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
        eventName: 'clipboard_event',
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
        eventName: 'clipboard_event',
        payloadJson: { eventName: 'clipboard_event', action: 'paste', textLength: 12 },
      }),
    ]);
    expect(result.evidence).toMatchObject({
      consent: [{ id: 'consent-1', status: 'accepted' }],
      precheck: [{ id: 'precheck-1', passed: true }],
      bypass: [{ id: 'bypass-1', status: 'used' }],
      finalFlush: [{ id: 'receipt-1', status: 'persisted' }],
      dataRequests: [{ id: 'request-1', requestType: 'delete' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/aiResult|aiScore/i);
  });

  it('removes snake_case and nested sensitive payload keys from admin timeline responses', async () => {
    const { service } = createService({
      eventRepository: {
        findByParticipation: jest.fn().mockResolvedValue([
          {
            id: 'event-sensitive',
            type: 'telemetry.batch',
            severity: 'warning',
            capturedAt: new Date('2026-06-12T10:00:00.000Z'),
            receivedAt: new Date('2026-06-12T10:00:01.000Z'),
            clientSeq: 1,
            payloadJson: {
              eventName: 'clipboard_event',
              action: 'paste',
              text: 'secret clipboard',
              rawText: 'raw secret clipboard text',
              content: 'content secret clipboard',
              clipboard_text: 'secret clipboard',
              raw_clipboard_text: 'raw secret clipboard',
              source_code: 'console.log(secret)',
              raw_prompt: 'prompt secret',
              raw_provider_response: 'provider secret',
              image_data: 'image bytes',
              video_data: 'video bytes',
              audio_data: 'audio bytes',
              key_strokes: 'typed secret',
              nested: {
                keep: 'safe nested value',
                raw_clipboard_text: 'nested clipboard secret',
                source_code: 'nested source secret',
              },
              events: [
                {
                  safeValue: 'safe array value',
                  raw_prompt: 'array prompt secret',
                },
                {
                  image_data: 'array image secret',
                  keepAlso: 'safe second array value',
                },
              ],
            },
          },
        ]),
      },
    });

    const result = await service.getReview('exam-1', 'participation-1', {
      userId: 'teacher-1',
      role: 'teacher',
    });

    const payload = result.timeline.items[0]!.payloadJson as Record<string, any>;
    expect(payload).toMatchObject({
      eventName: 'clipboard_event',
      action: 'paste',
      nested: { keep: 'safe nested value' },
      events: [{ safeValue: 'safe array value' }, { keepAlso: 'safe second array value' }],
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(
      /text|rawtext|content|clipboard_text|raw_clipboard_text|source_code|raw_prompt|raw_provider_response|image_data|video_data|audio_data|key_strokes/
    );
    expect(serialized).not.toMatch(/secret|bytes|console\.log/i);
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

  it('validates the selected model and enqueues a manual AI recompute job when requested', async () => {
    const customEventRepository = {
      findByParticipation: jest.fn().mockResolvedValue([
        {
          examId: 'exam-1',
          participationId: 'participation-1',
          sessionId: 'session-1',
          candidateUserId: 'candidate-1',
          clientSessionId: 'client-session-1',
          type: 'visibility_change',
          severity: 'warning',
          capturedAt: new Date('2026-06-12T10:00:00.000Z'),
        },
      ]),
    };
    const { service, modelRegistryService, aiJobService, auditLogRepository } = createService({
      eventRepository: customEventRepository,
    });

    await service.recompute(
      'exam-1',
      'participation-1',
      {
        userId: 'teacher-1',
        role: 'teacher',
      },
      {
        recomputeAi: true,
        modelVersion: 'iforest-v1',
        reason: 'manual audit',
      }
    );

    expect(modelRegistryService.resolveAnomalyModel).toHaveBeenCalledWith('iforest-v1');
    expect(customEventRepository.findByParticipation).toHaveBeenCalledWith(
      'participation-1',
      expect.objectContaining({ limit: 1000 })
    );
    expect(aiJobService.enqueueManualRecomputeWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        modelVersion: 'iforest-v1',
        reason: 'manual audit',
      })
    );
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'proctoring_review_recompute',
        metadata: expect.objectContaining({
          recomputeAi: true,
          modelVersion: 'iforest-v1',
          aiJobId: 'ai-job-1',
        }),
      })
    );
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

  it('stores manual review labels without overwriting official reviewer decision', async () => {
    const { service, reviewLabelRepository, summaryRepository, auditLogRepository } = createService();

    const result = await service.recordReviewLabel(
      'exam-1',
      'participation-1',
      {
        userId: 'reviewer-1',
        role: 'owner',
      },
      {
        reviewOutcome: 'policy_review_required',
        evidenceConfidence: 'high',
        notes: 'Label for evaluation only.',
      }
    );

    expect(reviewLabelRepository.upsertReviewerLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        participationId: 'participation-1',
        summaryId: 'summary-1',
        reviewerId: 'reviewer-1',
        reviewOutcome: 'policy_review_required',
        evidenceConfidence: 'high',
        labelSchemaVersion: 'review-label-v1',
      })
    );
    expect(summaryRepository.updateReviewerDecision).not.toHaveBeenCalled();
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        actorId: 'reviewer-1',
        action: 'proctoring_review_label',
        targetType: 'exam_participation',
        targetId: 'participation-1',
      })
    );
    expect(result).toMatchObject({ id: 'label-1', reviewOutcome: 'policy_review_required' });
  });

  it('hides AI advisory results when shadow mode or visibility gates block them', async () => {
    const { service, anomalyResultRepository } = createService({
      anomalyResultRepository: {
        findLatestByParticipation: jest.fn().mockResolvedValue([
          {
            windowId: 'window-1',
            modelVersion: 'iforest-v1',
            anomalyScore: 0.91,
            riskLevel: 'critical',
            topContributorsJson: [],
          },
        ]),
      },
    });

    const result = await service.getReview('exam-1', 'participation-1', {
      userId: 'teacher-1',
      role: 'teacher',
    });

    expect(result.aiAdvisory).toEqual({
      visible: false,
      status: 'hidden_shadow_mode',
      windows: [],
    });
    expect(anomalyResultRepository.findLatestByParticipation).not.toHaveBeenCalled();
  });

  it('returns sanitized advisory AI windows only when the visibility gate passes', async () => {
    const { service } = createService({
      settingsRepository: {
        findByExamId: jest.fn().mockResolvedValue({
          aiShadowMode: false,
          aiAdvisoryVisible: true,
          aiMinimumEvaluationStatus: 'passed_gate',
        }),
      },
      anomalyResultRepository: {
        findLatestByParticipation: jest.fn().mockResolvedValue([
          {
            windowId: 'window-1',
            windowStart: new Date('2026-06-12T10:00:00.000Z'),
            windowEnd: new Date('2026-06-12T10:05:00.000Z'),
            modelVersion: 'iforest-v1',
            featureSchemaVersion: 'browser-window-v1',
            scoringSchemaVersion: 'anomaly-score-v1',
            anomalyScore: 0.91,
            riskLevel: 'critical',
            explanationStatus: 'completed',
            topContributorsJson: [
              {
                featureName: 'visibilityHiddenMs',
                numericValue: 120000,
                contribution: 0.72,
                direction: 'increased_risk',
                displayLabel: 'Page hidden duration',
                rawClipboardText: 'drop me',
              },
            ],
          },
        ]),
      },
      evaluationReportRepository: {
        findLatestForModel: jest.fn().mockResolvedValue({
          status: 'passed_gate',
        }),
      },
    });

    const result = await service.getReview('exam-1', 'participation-1', {
      userId: 'teacher-1',
      role: 'teacher',
    });

    expect(result.aiAdvisory).toMatchObject({
      visible: true,
      status: 'visible',
      modelVersion: 'iforest-v1',
      latestRiskLevel: 'critical',
      maxAnomalyScore: 0.91,
    });
    expect(result.aiAdvisory.windows[0].topContributors).toEqual([
      {
        featureName: 'visibilityHiddenMs',
        numericValue: 120000,
        contribution: 0.72,
        direction: 'increased_risk',
        displayLabel: 'Page hidden duration',
      },
    ]);
    expect(JSON.stringify(result.aiAdvisory)).not.toContain('rawClipboardText');
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
