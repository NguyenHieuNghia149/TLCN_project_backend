import { ProctoringRiskService } from '../../../apps/api/src/services/proctoring/proctoring-risk.service';

function event(overrides: Record<string, unknown> = {}) {
  const capturedAt = new Date('2026-06-11T10:00:00.000Z');
  return {
    id: 'event-1',
    examId: 'exam-1',
    participationId: 'participation-1',
    sessionId: 'session-1',
    candidateUserId: 'candidate-1',
    clientSessionId: 'client-1',
    clientSeq: 1,
    type: 'heartbeat',
    severity: 'info',
    schemaVersion: 1,
    payloadJson: {},
    capturedAt,
    receivedAt: new Date(capturedAt.getTime() + 1000),
    persistedAt: new Date(capturedAt.getTime() + 2000),
    buffered: true,
    entrySessionId: null,
    finalFlushReceiptId: null,
    ...overrides,
  };
}

describe('ProctoringRiskService', () => {
  it('scores event counts with per-type caps and deterministic risk levels', () => {
    const service = new ProctoringRiskService();
    const events = [
      event({ id: 'e1', type: 'focus_change', clientSeq: 1 }),
      event({ id: 'e2', type: 'focus_change', clientSeq: 2 }),
      event({ id: 'e3', type: 'focus_change', clientSeq: 3 }),
      event({ id: 'e4', type: 'focus_change', clientSeq: 4 }),
      event({ id: 'e5', type: 'focus_change', clientSeq: 5 }),
      event({ id: 'e6', type: 'screen_share_change', clientSeq: 6 }),
      event({ id: 'e7', type: 'screen_share_change', clientSeq: 7 }),
    ];

    const result = service.compute(events as any);

    expect(result.eventCountsJson).toEqual({
      focus_change: 5,
      screen_share_change: 2,
    });
    expect(result.eventScore).toBe(56);
    expect(result.riskScore).toBe(76);
    expect(result.riskLevel).toBe('high');
  });

  it('orders velocity windows by capturedAt instead of receivedAt', () => {
    const service = new ProctoringRiskService();
    const events = [
      event({
        id: 'late-received',
        type: 'visibility_change',
        clientSeq: 1,
        capturedAt: new Date('2026-06-11T10:00:00.000Z'),
        receivedAt: new Date('2026-06-11T10:20:00.000Z'),
      }),
      event({
        id: 'second',
        type: 'visibility_change',
        clientSeq: 2,
        capturedAt: new Date('2026-06-11T10:01:00.000Z'),
        receivedAt: new Date('2026-06-11T10:01:01.000Z'),
      }),
      event({
        id: 'third',
        type: 'visibility_change',
        clientSeq: 3,
        capturedAt: new Date('2026-06-11T10:02:00.000Z'),
        receivedAt: new Date('2026-06-11T10:02:01.000Z'),
      }),
      event({
        id: 'outside-window',
        type: 'visibility_change',
        clientSeq: 4,
        capturedAt: new Date('2026-06-11T10:07:00.000Z'),
        receivedAt: new Date('2026-06-11T10:00:01.000Z'),
      }),
    ];

    const result = service.compute(events as any);

    expect(result.velocityJson).toMatchObject({
      windowSeconds: 300,
      maxEventsInWindow: 3,
      score: 10,
      windowStart: '2026-06-11T10:00:00.000Z',
      windowEnd: '2026-06-11T10:05:00.000Z',
    });
  });
});
