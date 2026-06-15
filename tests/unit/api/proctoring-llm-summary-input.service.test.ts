import { ProctoringLlmSummaryInputService } from '../../../apps/api/src/services/proctoring/proctoring-llm-summary-input.service';

function createService() {
  const eventRepository = {
    findByParticipationOrderedByCapturedAt: jest.fn().mockResolvedValue([
      {
        id: 'event-2',
        type: 'clipboard_event',
        severity: 'warning',
        capturedAt: new Date('2026-06-14T10:01:00.000Z'),
        payloadJson: { rawClipboardText: 'secret', sourceCode: 'print(1)', eventName: 'paste' },
      },
      {
        id: 'event-1',
        type: 'focus_change',
        severity: 'info',
        capturedAt: new Date('2026-06-14T10:00:00.000Z'),
        payloadJson: { eventName: 'window_blur', rawProviderResponse: 'nope' },
      },
    ]),
  };
  const summaryRepository = {
    findByParticipation: jest.fn().mockResolvedValue({
      id: 'det-summary-1',
      eventCountsJson: { focus_change: 1 },
      finalFlushStatus: 'persisted',
      reviewerDecision: 'needs_re_review',
    }),
  };
  const anomalyResultRepository = {
    findLatestByParticipation: jest.fn().mockResolvedValue([
      {
        windowId: 'window-1',
        modelVersion: 'iforest-v1',
        anomalyScore: 0.82,
        riskLevel: 'high',
        sourceEventRangeJson: { eventIds: ['event-1', 'event-2'], rawPrompt: 'nope' },
      },
    ]),
  };
  const reviewLabelRepository = {
    findByParticipation: jest.fn().mockResolvedValue([
      { reviewOutcome: 'follow_up_required', labelSchemaVersion: 'review-label-v1' },
    ]),
  };
  const service = new ProctoringLlmSummaryInputService({
    eventRepository: eventRepository as any,
    summaryRepository: summaryRepository as any,
    anomalyResultRepository: anomalyResultRepository as any,
    reviewLabelRepository: reviewLabelRepository as any,
    nowFactory: () => new Date('2026-06-14T10:05:00.000Z'),
  });
  return { service };
}

describe('ProctoringLlmSummaryInputService', () => {
  it('builds minimized canonical input and excludes raw sensitive fields from hash payload', async () => {
    const { service } = createService();

    const result = await service.buildInput({
      examId: 'exam-1',
      participationId: 'participation-1',
    });
    const second = await service.buildInput({
      examId: 'exam-1',
      participationId: 'participation-1',
    });

    expect(result.input.timeline.map(event => event.eventId)).toEqual(['event-1', 'event-2']);
    expect(result.input.timeline[0]).toEqual(
      expect.objectContaining({
        eventName: 'window_blur',
        type: 'focus_change',
        severity: 'info',
      })
    );
    expect(result.input.reviewFacts).toEqual({
      finalFlushStatus: 'persisted',
      reviewerDecision: 'needs_re_review',
      reviewLabelOutcome: 'follow_up_required',
    });
    expect(result.input.anomalyFacts).toEqual([
      expect.objectContaining({
        windowId: 'window-1',
        modelVersion: 'iforest-v1',
        anomalyScore: 0.82,
        riskLevel: 'high',
        sourceEventIds: ['event-1', 'event-2'],
      }),
    ]);
    expect(result.inputHash).toBe(second.inputHash);
    expect(JSON.stringify(result.input)).not.toMatch(
      /rawClipboardText|sourceCode|rawProviderResponse|rawPrompt|secret|print/
    );
  });
});
