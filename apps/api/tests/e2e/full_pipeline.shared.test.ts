import {
  extractAccessTokenFromLoginResponse,
  extractSubmissionCreateResponse,
  normalizePipelineStatus,
  resolveMaliciousProblemId,
} from './full_pipeline.shared';

describe('full pipeline response helpers', () => {
  it('extracts the access token from the wrapped login response shape', () => {
    expect(
      extractAccessTokenFromLoginResponse({
        success: true,
        data: {
          tokens: {
            accessToken: 'token-123',
          },
        },
      }),
    ).toBe('token-123');
  });

  it('extracts the access token from the legacy flat login response shape', () => {
    expect(
      extractAccessTokenFromLoginResponse({
        tokens: {
          accessToken: 'token-456',
        },
      }),
    ).toBe('token-456');
  });

  it('extracts the submission create payload from the wrapped response shape', () => {
    expect(
      extractSubmissionCreateResponse({
        success: true,
        data: {
          submissionId: 'sub-1',
          status: 'PENDING',
          message: 'queued',
          queuePosition: 1,
          estimatedWaitTime: 2,
        },
      }),
    ).toEqual({
      submissionId: 'sub-1',
      status: 'PENDING',
      message: 'queued',
      queuePosition: 1,
      estimatedWaitTime: 2,
    });
  });

  it('normalizes SSE statuses to uppercase', () => {
    expect(normalizePipelineStatus(' running ')).toBe('RUNNING');
    expect(normalizePipelineStatus('accepted')).toBe('ACCEPTED');
  });

  it('falls back to the golden problem id when the malicious problem id is blank or a placeholder', () => {
    expect(resolveMaliciousProblemId(undefined, 'golden-id')).toBe('golden-id');
    expect(resolveMaliciousProblemId('', 'golden-id')).toBe('golden-id');
    expect(resolveMaliciousProblemId('your-problem-id', 'golden-id')).toBe('golden-id');
    expect(resolveMaliciousProblemId('actual-malicious-id', 'golden-id')).toBe('actual-malicious-id');
  });
});
