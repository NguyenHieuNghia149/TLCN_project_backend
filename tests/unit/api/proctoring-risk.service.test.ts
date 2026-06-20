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

  it('counts frontend-shaped telemetry by payload eventName before transport type', () => {
    const service = new ProctoringRiskService();
    const events = [
      event({
        id: 'e1',
        type: 'telemetry.batch',
        clientSeq: 1,
        payloadJson: { eventName: 'clipboard_event' },
      }),
      event({
        id: 'e2',
        type: 'telemetry.batch',
        clientSeq: 2,
        payloadJson: { eventName: 'clipboard_event' },
      }),
      event({
        id: 'e3',
        type: 'telemetry.urgent',
        clientSeq: 3,
        payloadJson: { eventName: 'fullscreen_change' },
      }),
    ];

    const result = service.compute(events as any);

    expect(result.eventCountsJson).toEqual({
      clipboard_event: 2,
      fullscreen_change: 1,
    });
    expect(result.eventScore).toBe(32);
    expect(result.riskLevel).toBe('medium');
  });

  it('applies deterministic camera event weights and caps', () => {
    const service = new ProctoringRiskService();
    const events = [
      event({ id: 'e1', type: 'telemetry.batch', clientSeq: 1, payloadJson: { eventName: 'camera_started' } }),
      event({ id: 'e2', type: 'telemetry.batch', clientSeq: 2, payloadJson: { eventName: 'camera_track_unmuted' } }),
      event({ id: 'e3', type: 'telemetry.batch', clientSeq: 3, payloadJson: { eventName: 'camera_stopped' } }),
      event({ id: 'e4', type: 'telemetry.batch', clientSeq: 4, payloadJson: { eventName: 'camera_stopped' } }),
      event({ id: 'e5', type: 'telemetry.batch', clientSeq: 5, payloadJson: { eventName: 'camera_stopped' } }),
      event({ id: 'e6', type: 'telemetry.batch', clientSeq: 6, payloadJson: { eventName: 'camera_stopped' } }),
      event({ id: 'e7', type: 'telemetry.batch', clientSeq: 7, payloadJson: { eventName: 'camera_permission_denied' } }),
      event({ id: 'e8', type: 'telemetry.batch', clientSeq: 8, payloadJson: { eventName: 'camera_track_muted' } }),
      event({ id: 'e9', type: 'telemetry.batch', clientSeq: 9, payloadJson: { eventName: 'camera_error' } }),
    ];

    const result = service.compute(events as any, { velocityCap: 0 });

    expect(result.eventCountsJson).toEqual({
      camera_started: 1,
      camera_track_unmuted: 1,
      camera_stopped: 4,
      camera_permission_denied: 1,
      camera_track_muted: 1,
      camera_error: 1,
    });
    expect(result.eventScore).toBe(36);
    expect(result.velocityScore).toBe(0);
    expect(result.riskLevel).toBe('medium');
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
