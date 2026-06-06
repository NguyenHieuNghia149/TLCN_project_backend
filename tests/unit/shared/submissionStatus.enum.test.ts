import {
  ESubmissionStatus,
  fromGrpcSubmissionStatus,
  isTerminalSubmissionStatus,
  normalizeSubmissionStatus,
  toGrpcSubmissionStatus,
} from '@backend/shared/types';

describe('submission status contract', () => {
  it('normalizes canonical lower-case and historical upper-case statuses', () => {
    expect(normalizeSubmissionStatus('accepted')).toBe(ESubmissionStatus.ACCEPTED);
    expect(normalizeSubmissionStatus('ACCEPTED')).toBe(ESubmissionStatus.ACCEPTED);
    expect(normalizeSubmissionStatus('wrong_answer')).toBe(ESubmissionStatus.WRONG_ANSWER);
    expect(normalizeSubmissionStatus('WRONG_ANSWER')).toBe(ESubmissionStatus.WRONG_ANSWER);
    expect(normalizeSubmissionStatus('time_limit_exceeded')).toBe(
      ESubmissionStatus.TIME_LIMIT_EXCEEDED
    );
    expect(normalizeSubmissionStatus('TIME_LIMIT_EXCEEDED')).toBe(
      ESubmissionStatus.TIME_LIMIT_EXCEEDED
    );
  });

  it('returns null for invalid status inputs', () => {
    expect(normalizeSubmissionStatus('')).toBeNull();
    expect(normalizeSubmissionStatus('WA')).toBeNull();
    expect(normalizeSubmissionStatus(null)).toBeNull();
    expect(normalizeSubmissionStatus({ status: 'accepted' })).toBeNull();
  });

  it('detects terminal statuses with inbound normalization', () => {
    expect(isTerminalSubmissionStatus('pending')).toBe(false);
    expect(isTerminalSubmissionStatus('RUNNING')).toBe(false);
    expect(isTerminalSubmissionStatus('accepted')).toBe(true);
    expect(isTerminalSubmissionStatus('WRONG_ANSWER')).toBe(true);
    expect(isTerminalSubmissionStatus('system_error')).toBe(true);
    expect(isTerminalSubmissionStatus('SYSTEM_ERROR')).toBe(true);
  });

  it('converts only at the gRPC boundary', () => {
    expect(toGrpcSubmissionStatus(ESubmissionStatus.RUNTIME_ERROR)).toBe('RUNTIME_ERROR');
    expect(toGrpcSubmissionStatus(ESubmissionStatus.MEMORY_LIMIT_EXCEEDED)).toBe(
      'MEMORY_LIMIT_EXCEEDED'
    );
    expect(fromGrpcSubmissionStatus('COMPILATION_ERROR')).toBe(
      ESubmissionStatus.COMPILATION_ERROR
    );
    expect(fromGrpcSubmissionStatus('compilation_error')).toBe(
      ESubmissionStatus.COMPILATION_ERROR
    );
    expect(fromGrpcSubmissionStatus('not-a-status')).toBeNull();
  });
});
