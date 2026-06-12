import axios from 'axios';

export type ProctoringAiTelemetryWindow = {
  schemaVersion: number;
  windowId: string;
  examId: string;
  participationId: string;
  candidateUserId: string;
  consentRecordId: string;
  startedAt: string;
  endedAt: string;
  features: Record<string, number>;
  context?: Record<string, unknown>;
};

export type ProctoringAiPrediction = {
  windowId: string;
  examId: string;
  participationId: string;
  modelVersion: string;
  anomalyScore: number;
  rawScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  explanationStatus?: string;
  topContributors?: unknown[];
};

type ProctoringAiHttpClientOptions = {
  serverAiUrl?: string;
  internalToken?: string;
  timeoutMs?: number;
};

const allowedRiskLevels = new Set(['low', 'medium', 'high', 'critical']);

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class ProctoringAiHttpClient {
  private readonly serverAiUrl: string;
  private readonly internalToken?: string;
  private readonly timeoutMs: number;

  constructor(options: ProctoringAiHttpClientOptions = {}) {
    this.serverAiUrl = normalizeBaseUrl(
      options.serverAiUrl ?? process.env.SERVER_AI_URL ?? 'http://localhost:8001'
    );
    this.internalToken = options.internalToken ?? process.env.SERVER_AI_INTERNAL_TOKEN;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async predict(window: ProctoringAiTelemetryWindow): Promise<ProctoringAiPrediction> {
    const headers = this.internalToken
      ? {
          Authorization: `Bearer ${this.internalToken}`,
        }
      : undefined;
    const response = await axios.post(`${this.serverAiUrl}/anomaly/predict`, window, {
      timeout: this.timeoutMs,
      headers,
    });

    return this.validateResponse(response.data);
  }

  private validateResponse(value: unknown): ProctoringAiPrediction {
    if (!isRecord(value)) {
      throw new Error('Invalid proctoring AI response: response must be an object');
    }

    const modelVersion = value.modelVersion;
    const anomalyScore = value.anomalyScore;
    const riskLevel = value.riskLevel;
    if (
      typeof modelVersion !== 'string' ||
      modelVersion.length === 0 ||
      typeof anomalyScore !== 'number' ||
      !Number.isFinite(anomalyScore) ||
      anomalyScore < 0 ||
      anomalyScore > 1 ||
      typeof riskLevel !== 'string' ||
      !allowedRiskLevels.has(riskLevel)
    ) {
      throw new Error('Invalid proctoring AI response');
    }

    return value as ProctoringAiPrediction;
  }
}
