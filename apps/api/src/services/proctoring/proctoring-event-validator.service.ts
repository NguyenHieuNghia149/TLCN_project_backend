import { sanitizeTelemetryPayload } from './proctoring-redis.service';

export class ProctoringValidationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ProctoringValidationError';
  }
}

export const PROCTORING_CLIENT_EVENT_ALLOWLIST = new Set([
  'session.hello',
  'telemetry.batch',
  'telemetry.urgent',
  'final_flush.request',
]);

const forbiddenPayloadKeys = new Set([
  'rawmedia',
  'media',
  'imagedata',
  'videodata',
  'audiodata',
  'clipboardtext',
  'rawclipboardtext',
  'keystrokes',
  'keystrokecontent',
  'keycontent',
  'sourcecode',
  'code',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasForbiddenPayloadField(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (forbiddenPayloadKeys.has(key.toLowerCase())) {
      return true;
    }
    return hasForbiddenPayloadField(nestedValue);
  });
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProctoringValidationError(`${field} is required`, 'INVALID_PROCTORING_FRAME');
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProctoringValidationError(`${field} must be a finite number`, 'INVALID_PROCTORING_FRAME');
  }
  return value;
}

function normalizeTimestamp(value: unknown, field: string): string {
  const raw = requireString(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ProctoringValidationError(`${field} must be an ISO timestamp`, 'INVALID_PROCTORING_FRAME');
  }
  return date.toISOString();
}

export type ProctoringSessionHelloInput = {
  participationId: string;
  clientSessionId: string;
  userId: string;
  lastSeenClientSeq: number;
};

export type ProctoringTelemetryFrameInput = {
  type: string;
  participationId: string;
  clientSessionId: string;
  clientSeq: number;
  capturedAt: string;
  receivedAt: string;
  schemaVersion: number;
  severity: string;
  payloadJson: Record<string, unknown>;
  entrySessionId?: string | null;
  finalFlushReceiptId?: string | null;
  id?: string | null;
};

export type ProctoringFinalFlushRequestInput = {
  participationId: string;
  clientSessionId: string;
  submitAttemptId: string;
  expectedEventCount?: number;
  acceptedCount?: number;
  firstClientSeq?: number | null;
  lastClientSeq?: number | null;
};

export class ProctoringEventValidatorService {
  validateSessionHello(input: unknown): ProctoringSessionHelloInput {
    if (!isRecord(input)) {
      throw new ProctoringValidationError('session.hello payload must be an object', 'INVALID_SESSION_HELLO');
    }

    return {
      participationId: requireString(input.participationId, 'participationId'),
      clientSessionId: requireString(input.clientSessionId, 'clientSessionId'),
      userId: requireString(input.userId, 'userId'),
      lastSeenClientSeq: requireNumber(input.lastSeenClientSeq, 'lastSeenClientSeq'),
    };
  }

  validateTelemetryFrame(input: unknown): ProctoringTelemetryFrameInput {
    if (!isRecord(input)) {
      throw new ProctoringValidationError('telemetry frame must be an object', 'INVALID_PROCTORING_FRAME');
    }

    const type = requireString(input.type, 'type');
    if (!PROCTORING_CLIENT_EVENT_ALLOWLIST.has(type)) {
      throw new ProctoringValidationError(
        `Telemetry event type is not in allowlist: ${type}`,
        'TELEMETRY_TYPE_NOT_ALLOWED',
      );
    }

    const payloadJson = isRecord(input.payloadJson) ? input.payloadJson : {};
    if (hasForbiddenPayloadField(payloadJson)) {
      throw new ProctoringValidationError(
        'Forbidden payload fields are not allowed in proctoring telemetry',
        'FORBIDDEN_TELEMETRY_PAYLOAD',
      );
    }

    return {
      type,
      participationId: requireString(input.participationId, 'participationId'),
      clientSessionId: requireString(input.clientSessionId, 'clientSessionId'),
      clientSeq: requireNumber(input.clientSeq, 'clientSeq'),
      capturedAt: normalizeTimestamp(input.capturedAt, 'capturedAt'),
      receivedAt: normalizeTimestamp(input.receivedAt, 'receivedAt'),
      schemaVersion: requireNumber(input.schemaVersion, 'schemaVersion'),
      severity: requireString(input.severity, 'severity'),
      payloadJson: sanitizeTelemetryPayload(payloadJson),
      entrySessionId:
        typeof input.entrySessionId === 'string' && input.entrySessionId.length > 0
          ? input.entrySessionId
          : null,
      finalFlushReceiptId:
        typeof input.finalFlushReceiptId === 'string' && input.finalFlushReceiptId.length > 0
          ? input.finalFlushReceiptId
          : null,
      id: typeof input.id === 'string' && input.id.length > 0 ? input.id : null,
    };
  }

  validateFinalFlushRequest(input: unknown): ProctoringFinalFlushRequestInput {
    if (!isRecord(input)) {
      throw new ProctoringValidationError('final_flush.request payload must be an object', 'INVALID_FINAL_FLUSH_REQUEST');
    }

    return {
      participationId: requireString(input.participationId, 'participationId'),
      clientSessionId: requireString(input.clientSessionId, 'clientSessionId'),
      submitAttemptId: requireString(input.submitAttemptId, 'submitAttemptId'),
      expectedEventCount:
        input.expectedEventCount === undefined
          ? undefined
          : requireNumber(input.expectedEventCount, 'expectedEventCount'),
      acceptedCount:
        input.acceptedCount === undefined
          ? undefined
          : requireNumber(input.acceptedCount, 'acceptedCount'),
      firstClientSeq:
        input.firstClientSeq === undefined || input.firstClientSeq === null
          ? null
          : requireNumber(input.firstClientSeq, 'firstClientSeq'),
      lastClientSeq:
        input.lastClientSeq === undefined || input.lastClientSeq === null
          ? null
          : requireNumber(input.lastClientSeq, 'lastClientSeq'),
    };
  }
}
