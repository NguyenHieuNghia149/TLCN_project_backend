describe('ProctoringEventValidatorService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('validates session hello payloads and normalizes the client session context', () => {
    const { ProctoringEventValidatorService } = require('../../../apps/api/src/services/proctoring/proctoring-event-validator.service');
    const validator = new ProctoringEventValidatorService();

    expect(
      validator.validateSessionHello({
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        userId: 'candidate-1',
        lastSeenClientSeq: 12,
      }),
    ).toEqual({
      participationId: 'participation-1',
      clientSessionId: 'client-1',
      userId: 'candidate-1',
      lastSeenClientSeq: 12,
    });

    expect(() =>
      validator.validateSessionHello({
        participationId: 'participation-1',
        clientSessionId: '',
        userId: 'candidate-1',
        lastSeenClientSeq: 12,
      }),
    ).toThrow(/clientSessionId/i);
  });

  it('accepts allowed telemetry event types and rejects forbidden payload fields', () => {
    const { ProctoringEventValidatorService } = require('../../../apps/api/src/services/proctoring/proctoring-event-validator.service');
    const validator = new ProctoringEventValidatorService();

    expect(
      validator.validateTelemetryFrame({
        type: 'telemetry.batch',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        clientSeq: 7,
        capturedAt: '2026-06-11T10:00:00.000Z',
        receivedAt: '2026-06-11T10:00:01.000Z',
        schemaVersion: 1,
        severity: 'info',
        payloadJson: {
          eventName: 'clipboard_event',
          action: 'paste',
        },
      }),
    ).toMatchObject({
      type: 'telemetry.batch',
      payloadJson: {
        eventName: 'clipboard_event',
        action: 'paste',
      },
    });

    expect(() =>
      validator.validateTelemetryFrame({
        type: 'telemetry.batch',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        clientSeq: 7,
        capturedAt: '2026-06-11T10:00:00.000Z',
        receivedAt: '2026-06-11T10:00:01.000Z',
        schemaVersion: 1,
        severity: 'info',
        payloadJson: {
          rawClipboardText: 'secret text',
        },
      }),
    ).toThrow(/forbidden/i);

    expect(() =>
      validator.validateTelemetryFrame({
        type: 'unknown.event',
        participationId: 'participation-1',
        clientSessionId: 'client-1',
        clientSeq: 7,
        capturedAt: '2026-06-11T10:00:00.000Z',
        receivedAt: '2026-06-11T10:00:01.000Z',
        schemaVersion: 1,
        severity: 'info',
        payloadJson: {},
      }),
    ).toThrow(/allowlist/i);
  });
});
