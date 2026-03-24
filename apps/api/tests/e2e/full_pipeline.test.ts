import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';
import { sql } from 'drizzle-orm';
import { DatabaseService, db } from '../../../../packages/shared/db/connection';
import {
  extractAccessTokenFromLoginResponse,
  extractSubmissionCreateResponse,
  normalizePipelineStatus,
  resolveMaliciousProblemId,
  type SubmissionCreateResponse,
} from './full_pipeline.shared';

type SubmissionSsePayload = {
  submissionId?: string;
  status?: string;
  message?: string;
  score?: number;
  result?: unknown;
  overall_status?: string;
  isRunOnly?: boolean;
};

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const TERMINAL_STATUSES = new Set([
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'RUNTIME_ERROR',
  'COMPILATION_ERROR',
  'SYSTEM_ERROR',
  'INTERNAL_ERROR',
  'WA',
  'TLE',
  'MLE',
  'CE',
  'RE',
]);

const ACCEPTED_STATUSES = new Set(['ACCEPTED']);
const MALICIOUS_ALLOWED_STATUSES = new Set(['TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR']);

const GOLDEN_CPP = `
class Solution {
public:
  int climbStairs(int n) {
    if (n <= 2) {
      return n;
    }

    int prev = 1;
    int curr = 2;
    for (int step = 3; step <= n; ++step) {
      const int next = prev + curr;
      prev = curr;
      curr = next;
    }

    return curr;
  }
};
`.trim();

const MALICIOUS_CPP = `
class Solution {
public:
  int climbStairs(int n) {
    while (true) {
    }

    return 0;
  }
};
`.trim();

function colorize(color: keyof typeof COLORS, message: string): string {
  return `${COLORS[color]}${message}${COLORS.reset}`;
}

function logInfo(message: string): void {
  console.log(colorize('blue', `[INFO] ${message}`));
}

function logStep(message: string): void {
  console.log(colorize('cyan', `[STEP] ${message}`));
}

function logPass(message: string): void {
  console.log(colorize('green', `[PASS] ${message}`));
}

function logFail(message: string): void {
  console.error(colorize('red', `[FAIL] ${message}`));
}

function logDebug(message: string): void {
  console.log(colorize('gray', `[DEBUG] ${message}`));
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`);
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function extractRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }

  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

async function resolveGoldenProblemId(configuredProblemId: string | undefined): Promise<string> {
  await DatabaseService.connect();

  const normalizedConfiguredId = configuredProblemId?.trim();
  if (normalizedConfiguredId && normalizedConfiguredId !== 'your-problem-id') {
    const configuredResult = await db.execute(sql`
      SELECT id
      FROM problems
      WHERE id = ${normalizedConfiguredId}::uuid
        AND visibility = 'public'
        AND title = 'Climbing Stairs'
        AND function_signature IS NOT NULL
      LIMIT 1
    `);

    const configuredId = extractRows(configuredResult)[0]?.id;
    if (typeof configuredId === 'string' && configuredId.length > 0) {
      return configuredId;
    }
  }

  const fallbackResult = await db.execute(sql`
    SELECT id
    FROM problems
    WHERE visibility = 'public'
      AND title = 'Climbing Stairs'
      AND function_signature IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const fallbackId = extractRows(fallbackResult)[0]?.id;
  if (typeof fallbackId !== 'string' || fallbackId.length === 0) {
    throw new Error('Could not resolve a public Climbing Stairs problem id for E2E');
  }

  return fallbackId;
}

function getTerminalStatus(payload: SubmissionSsePayload): string | undefined {
  const candidates = [payload.status, payload.overall_status].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return candidates.map(normalizePipelineStatus).find(candidate => TERMINAL_STATUSES.has(candidate));
}

function createHttpClient(baseUrl: string, timeoutMs: number): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    validateStatus: () => true,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function preflight(http: AxiosInstance): Promise<void> {
  logStep('Running preflight checks');

  const [healthResponse, queueResponse] = await Promise.all([
    http.get('/health'),
    http.get('/submissions/queue/status'),
  ]);

  if (healthResponse.status !== 200) {
    throw new Error(`API health check failed with status ${healthResponse.status}`);
  }

  if (queueResponse.status !== 200) {
    throw new Error(`Submission queue status check failed with status ${queueResponse.status}`);
  }

  logPass('API health endpoint is reachable');
  logPass('Submission queue endpoint is reachable');
}

async function resolveAccessToken(http: AxiosInstance): Promise<string> {
  const directToken = process.env.E2E_ACCESS_TOKEN?.trim();
  if (directToken) {
    logPass('Using access token from E2E_ACCESS_TOKEN');
    return directToken;
  }

  const email = readRequiredEnv('E2E_EMAIL');
  const password = readRequiredEnv('E2E_PASSWORD');

  logStep(`Logging in as ${email}`);

  const response = await http.post('/auth/login', {
    email,
    password,
    rememberMe: false,
  });

  if (response.status !== 200) {
    throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(response.data)}`);
  }
  const accessToken = extractAccessTokenFromLoginResponse(response.data);

  logPass('Authenticated successfully');
  return accessToken;
}

async function createSubmission(
  http: AxiosInstance,
  accessToken: string,
  payload: {
    sourceCode: string;
    language: 'cpp';
    problemId: string;
  },
  label: string,
): Promise<SubmissionCreateResponse> {
  logStep(`${label}: creating submission`);

  const response = await http.post('/submissions', payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status !== 201) {
    throw new Error(
      `${label}: submission creation failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  const data = extractSubmissionCreateResponse(response.data);

  if (!data || typeof data.submissionId !== 'string' || data.submissionId.length === 0) {
    throw new Error(`${label}: submissionId missing from create response`);
  }

  if (normalizePipelineStatus(data.status) !== 'PENDING') {
    throw new Error(`${label}: expected initial status PENDING but received ${data.status}`);
  }

  logPass(`${label}: submission created (${data.submissionId})`);
  logPass(`${label}: initial POST status is PENDING`);

  return data;
}

async function waitForSseTerminalStatus(params: {
  baseUrl: string;
  submissionId: string;
  accessToken: string;
  timeoutMs: number;
  label: string;
  expectedTerminalStatuses: Set<string>;
}): Promise<{
  events: SubmissionSsePayload[];
  terminalStatus: string;
}> {
  const { baseUrl, submissionId, accessToken, timeoutMs, label, expectedTerminalStatuses } = params;
  const sseUrl = `${baseUrl}/submissions/stream/${submissionId}?token=${encodeURIComponent(accessToken)}`;

  logStep(`${label}: opening SSE stream`);

  const controller = new AbortController();
  const response = await withTimeout(
    fetch(sseUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    }),
    timeoutMs,
    `${label} SSE connection`,
  );

  if (!response.ok) {
    throw new Error(`${label}: SSE connection failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error(`${label}: SSE response body is empty`);
  }

  logPass(`${label}: SSE connected`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: SubmissionSsePayload[] = [];
  const seenStatuses = new Set<string>();

  try {
    let buffer = '';

    const terminalStatus = await withTimeout(
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const delimiterIndex = buffer.indexOf('\n\n');
            if (delimiterIndex === -1) {
              break;
            }

            const rawEvent = buffer.slice(0, delimiterIndex);
            buffer = buffer.slice(delimiterIndex + 2);

            const dataLines = rawEvent
              .split(/\r?\n/)
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trim());

            if (dataLines.length === 0) {
              continue;
            }

            const dataText = dataLines.join('\n');
            const payload = JSON.parse(dataText) as SubmissionSsePayload;
            events.push(payload);

            const status = payload.status ?? payload.overall_status ?? 'UNKNOWN';
            const normalizedStatus =
              typeof status === 'string' ? normalizePipelineStatus(status) : 'UNKNOWN';
            seenStatuses.add(normalizedStatus);
            logDebug(`${label}: SSE status update -> ${normalizedStatus}`);

            const terminal = getTerminalStatus(payload);
            if (terminal) {
              return terminal;
            }
          }
        }

        throw new Error(`${label}: SSE stream closed before a terminal status was received`);
      })(),
      timeoutMs,
      `${label} SSE terminal status`,
    );

    if (seenStatuses.size === 0) {
      throw new Error(`${label}: expected SSE to emit at least one status update`);
    }

    if (!expectedTerminalStatuses.has(terminalStatus)) {
      throw new Error(
        `${label}: expected terminal status ${Array.from(expectedTerminalStatuses).join(' or ')} but received ${terminalStatus}`,
      );
    }

    logPass(`${label}: observed SSE statuses -> ${Array.from(seenStatuses).join(', ')}`);
    logPass(`${label}: terminal status is ${terminalStatus}`);

    return { events, terminalStatus };
  } finally {
    controller.abort();
    try {
      await reader.cancel();
    } catch {
      // Ignore reader cancellation errors during cleanup.
    }
  }
}

async function run(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.env.E2E_BASE_URL?.trim() || 'http://localhost:3001/api');
  const timeoutMs = readNumberEnv('E2E_TIMEOUT_MS', 15000);
  const goldenProblemId = await resolveGoldenProblemId(process.env.E2E_GOLDEN_PROBLEM_ID);
  const maliciousProblemId = resolveMaliciousProblemId(process.env.E2E_MALICIOUS_PROBLEM_ID, goldenProblemId);

  logInfo(`Base URL: ${baseUrl}`);
  logInfo(`Timeout: ${timeoutMs}ms`);

  const http = createHttpClient(baseUrl, timeoutMs);

  await preflight(http);
  const accessToken = await resolveAccessToken(http);

  const goldenSubmission = await createSubmission(
    http,
    accessToken,
    {
      sourceCode: GOLDEN_CPP,
      language: 'cpp',
      problemId: goldenProblemId,
    },
    'Golden Path',
  );

  await waitForSseTerminalStatus({
    baseUrl,
    submissionId: goldenSubmission.submissionId,
    accessToken,
    timeoutMs,
    label: 'Golden Path',
    expectedTerminalStatuses: ACCEPTED_STATUSES,
  });

  const maliciousSubmission = await createSubmission(
    http,
    accessToken,
    {
      sourceCode: MALICIOUS_CPP,
      language: 'cpp',
      problemId: maliciousProblemId,
    },
    'Malicious Payload',
  );

  await waitForSseTerminalStatus({
    baseUrl,
    submissionId: maliciousSubmission.submissionId,
    accessToken,
    timeoutMs,
    label: 'Malicious Payload',
    expectedTerminalStatuses: MALICIOUS_ALLOWED_STATUSES,
  });

  logPass('Full pipeline E2E test completed successfully');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    logFail(message);
    process.exit(1);
  });

