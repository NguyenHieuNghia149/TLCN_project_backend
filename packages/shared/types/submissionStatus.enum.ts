export enum ESubmissionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  RUNTIME_ERROR = 'runtime_error',
  COMPILATION_ERROR = 'compilation_error',
  SYSTEM_ERROR = 'system_error',
}

export const SUBMISSION_STATUS_VALUES = Object.values(ESubmissionStatus) as [
  ESubmissionStatus,
  ...ESubmissionStatus[],
];

const SUBMISSION_STATUS_SET = new Set<string>(SUBMISSION_STATUS_VALUES);

const NON_TERMINAL_SUBMISSION_STATUSES = new Set<ESubmissionStatus>([
  ESubmissionStatus.PENDING,
  ESubmissionStatus.RUNNING,
]);

export function normalizeSubmissionStatus(value: unknown): ESubmissionStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!SUBMISSION_STATUS_SET.has(normalized)) {
    return null;
  }

  return normalized as ESubmissionStatus;
}

export function isTerminalSubmissionStatus(value: unknown): boolean {
  const status = normalizeSubmissionStatus(value);
  return status !== null && !NON_TERMINAL_SUBMISSION_STATUSES.has(status);
}

export function toGrpcSubmissionStatus(status: ESubmissionStatus): string {
  return status.toUpperCase();
}

export function fromGrpcSubmissionStatus(value: unknown): ESubmissionStatus | null {
  return normalizeSubmissionStatus(value);
}
