export type SubmissionCreateResponse = {
  submissionId: string;
  status: string;
  message?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Extracts the access token from either the wrapped API envelope or the legacy flat response shape. */
export function extractAccessTokenFromLoginResponse(responseBody: unknown): string {
  const response = asRecord(responseBody);
  const wrappedData = asRecord(response?.data);
  const wrappedTokens = asRecord(wrappedData?.tokens);
  const flatTokens = asRecord(response?.tokens);

  const accessToken = wrappedTokens?.accessToken ?? flatTokens?.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('Login succeeded but tokens.accessToken was missing in the response');
  }

  return accessToken;
}

/** Extracts the submission create payload from either the wrapped API envelope or the legacy flat response shape. */
export function extractSubmissionCreateResponse(responseBody: unknown): SubmissionCreateResponse {
  const response = asRecord(responseBody);
  const data = asRecord(response?.data) ?? response;

  const submissionId = data?.submissionId;
  const status = data?.status;

  if (typeof submissionId !== 'string' || submissionId.length === 0) {
    throw new Error('submissionId missing from create response');
  }

  if (typeof status !== 'string' || status.length === 0) {
    throw new Error('status missing from create response');
  }

  return {
    submissionId,
    status,
    message: typeof data?.message === 'string' ? data.message : undefined,
    queuePosition: typeof data?.queuePosition === 'number' ? data.queuePosition : undefined,
    estimatedWaitTime: typeof data?.estimatedWaitTime === 'number' ? data.estimatedWaitTime : undefined,
  };
}

/** Normalizes pipeline statuses so HTTP and SSE payload casing are compared consistently. */
export function normalizePipelineStatus(status: string): string {
  return status.trim().toUpperCase();
}

/** Normalizes the optional malicious problem id and falls back to the golden problem when the value is blank or still a placeholder. */
export function resolveMaliciousProblemId(rawProblemId: string | undefined, goldenProblemId: string): string {
  const normalized = rawProblemId?.trim();
  if (!normalized || normalized === 'your-problem-id') {
    return goldenProblemId;
  }

  return normalized;
}
