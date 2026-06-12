import { ProctoringSummaryService } from '../../../apps/api/src/services/proctoring/proctoring-summary.service';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    examId: 'exam-1',
    participationId: 'participation-1',
    sessionId: 'session-1',
    candidateUserId: 'candidate-1',
    clientSessionId: 'client-1',
    clientSeq: 1,
    type: 'focus_change',
    severity: 'warning',
    schemaVersion: 1,
    payloadJson: {},
    capturedAt: new Date('2026-06-11T10:00:00.000Z'),
    receivedAt: new Date('2026-06-11T10:00:01.000Z'),
    persistedAt: new Date('2026-06-11T10:00:02.000Z'),
    buffered: true,
    entrySessionId: null,
    finalFlushReceiptId: null,
    ...overrides,
  };
}

describe('ProctoringSummaryService', () => {
  it('recomputes from persisted PostgreSQL events and ignores AI job output', async () => {
    const eventRepository = {
      findByParticipationOrderedByCapturedAt: jest.fn().mockResolvedValue([
        event({
          id: 'newer-received-first',
          clientSeq: 2,
          type: 'screen_share_change',
          capturedAt: new Date('2026-06-11T10:02:00.000Z'),
          receivedAt: new Date('2026-06-11T10:00:01.000Z'),
        }),
        event({
          id: 'older-captured',
          clientSeq: 1,
          type: 'focus_change',
          capturedAt: new Date('2026-06-11T10:00:00.000Z'),
          receivedAt: new Date('2026-06-11T10:20:00.000Z'),
        }),
      ]),
    };
    const summaryRepository = {
      upsertComputedForParticipation: jest.fn().mockImplementation(async values => values),
    };
    const aiJobRepository = {
      findByParticipation: jest.fn().mockResolvedValue([
        {
          resultJson: { anomalyScore: 1, riskLevel: 'critical' },
        },
      ]),
    };
    const service = new ProctoringSummaryService({
      eventRepository: eventRepository as any,
      summaryRepository: summaryRepository as any,
      aiJobRepository: aiJobRepository as any,
    });

    const summary = await service.recomputeForParticipation({
      participationId: 'participation-1',
      finalFlushStatus: 'persisted',
      now: new Date('2026-06-11T10:10:00.000Z'),
    });

    expect(aiJobRepository.findByParticipation).not.toHaveBeenCalled();
    expect(eventRepository.findByParticipationOrderedByCapturedAt).toHaveBeenCalledWith(
      'participation-1'
    );
    expect(summaryRepository.upsertComputedForParticipation).toHaveBeenCalledWith(
      expect.objectContaining({
        examId: 'exam-1',
        participationId: 'participation-1',
        sessionId: 'session-1',
        finalFlushStatus: 'persisted',
        eventCountsJson: {
          focus_change: 1,
          screen_share_change: 1,
        },
        lastEventCapturedAt: new Date('2026-06-11T10:02:00.000Z'),
        lastEventReceivedAt: new Date('2026-06-11T10:20:00.000Z'),
        deterministicSchemaVersion: 'phase-1-deterministic-risk-v1',
        computedAt: new Date('2026-06-11T10:10:00.000Z'),
      }),
      { preserveReviewerDecision: true }
    );
    expect(summary.riskLevel).toBe('medium');
  });

  it('can explicitly mark an existing reviewer decision for re-review', async () => {
    const eventRepository = {
      findByParticipationOrderedByCapturedAt: jest.fn().mockResolvedValue([event()]),
    };
    const summaryRepository = {
      upsertComputedForParticipation: jest.fn().mockImplementation(async values => ({
        ...values,
        reviewerDecision: values.reviewerDecision,
      })),
    };
    const service = new ProctoringSummaryService({
      eventRepository: eventRepository as any,
      summaryRepository: summaryRepository as any,
    });

    await service.recomputeForParticipation({
      participationId: 'participation-1',
      reviewPolicy: { needsReReview: true },
    });

    expect(summaryRepository.upsertComputedForParticipation).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerDecision: 'needs_re_review' }),
      { preserveReviewerDecision: false }
    );
  });
});
