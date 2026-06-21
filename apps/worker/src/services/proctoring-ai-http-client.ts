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

export type ProctoringAiFeatureContribution = {
  featureName: string;
  numericValue: number;
  contribution: number;
  direction: 'increased_risk' | 'decreased_risk';
  displayLabel: string;
};

export type ProctoringAiExplanationRequest = {
  telemetry: ProctoringAiTelemetryWindow;
  modelVersion: string;
  anomalyScore: number;
  riskLevel: 'high' | 'critical';
  maxContributors?: number;
};

export type ProctoringAiExplanation = {
  windowId: string;
  examId: string;
  participationId: string;
  modelVersion: string;
  anomalyScore: number;
  riskLevel: 'high' | 'critical';
  explanationStatus: 'completed' | 'skipped' | 'failed';
  topContributors: ProctoringAiFeatureContribution[];
};

export type ProctoringLlmSummaryResponse = {
  summaryText: string;
  riskFacts: Array<{
    type: string;
    count: number;
    totalDurationMs: number;
    evidenceEventIds: string[];
  }>;
  citations: Array<{ eventId: string; reason: string }>;
  missingDataNotes: string[];
  modelNotes: string[];
  guardRailWarnings: string[];
  validationStatus: 'passed' | 'failed' | 'skipped';
  validationScore?: number;
  validationErrors?: string[];
  modelVersion: string;
  judgeModelVersion?: string;
  promptVersion: string;
  outputSchemaVersion: 'proctoring-summary-output-v1';
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

  async explain(request: ProctoringAiExplanationRequest): Promise<ProctoringAiExplanation> {
    const headers = this.internalToken
      ? {
          Authorization: `Bearer ${this.internalToken}`,
        }
      : undefined;
    const response = await axios.post(`${this.serverAiUrl}/anomaly/explain`, request, {
      timeout: this.timeoutMs,
      headers,
    });

    return this.validateExplanationResponse(response.data);
  }

  async generateSummary(request: Record<string, unknown>): Promise<ProctoringLlmSummaryResponse> {
    const headers = this.internalToken
      ? {
          Authorization: `Bearer ${this.internalToken}`,
        }
      : undefined;
    const response = await axios.post(`${this.serverAiUrl}/summary/generate`, request, {
      timeout: this.timeoutMs,
      headers,
    });

    return this.validateSummaryResponse(response.data);
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

  private validateExplanationResponse(value: unknown): ProctoringAiExplanation {
    if (!isRecord(value)) {
      throw new Error('Invalid proctoring AI explanation response: response must be an object');
    }

    const base = this.validateResponse({
      ...value,
      rawScore: typeof value.rawScore === 'number' ? value.rawScore : value.anomalyScore,
    });
    if (base.riskLevel !== 'high' && base.riskLevel !== 'critical') {
      throw new Error('Invalid proctoring AI explanation response');
    }

    const explanationStatus = value.explanationStatus;
    if (
      explanationStatus !== 'completed' &&
      explanationStatus !== 'skipped' &&
      explanationStatus !== 'failed'
    ) {
      throw new Error('Invalid proctoring AI explanation response');
    }

    return {
      windowId: base.windowId,
      examId: base.examId,
      participationId: base.participationId,
      modelVersion: base.modelVersion,
      anomalyScore: base.anomalyScore,
      riskLevel: base.riskLevel,
      explanationStatus,
      topContributors: this.sanitizeContributors(value.topContributors),
    };
  }

  private sanitizeContributors(value: unknown): ProctoringAiFeatureContribution[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap(item => {
      if (!isRecord(item)) {
        return [];
      }
      if (
        typeof item.featureName !== 'string' ||
        typeof item.numericValue !== 'number' ||
        typeof item.contribution !== 'number' ||
        (item.direction !== 'increased_risk' && item.direction !== 'decreased_risk') ||
        typeof item.displayLabel !== 'string'
      ) {
        return [];
      }

      return [
        {
          featureName: item.featureName,
          numericValue: item.numericValue,
          contribution: item.contribution,
          direction: item.direction,
          displayLabel: item.displayLabel,
        },
      ];
    });
  }

  private validateSummaryResponse(value: unknown): ProctoringLlmSummaryResponse {
    if (!isRecord(value)) {
      throw new Error('Invalid proctoring LLM summary response: response must be an object');
    }
    if (
      typeof value.summaryText !== 'string' ||
      !Array.isArray(value.riskFacts) ||
      !Array.isArray(value.citations) ||
      !Array.isArray(value.missingDataNotes) ||
      !Array.isArray(value.modelNotes) ||
      (value.validationStatus !== 'passed' &&
        value.validationStatus !== 'failed' &&
        value.validationStatus !== 'skipped') ||
      typeof value.modelVersion !== 'string' ||
      typeof value.promptVersion !== 'string' ||
      value.outputSchemaVersion !== 'proctoring-summary-output-v1'
    ) {
      throw new Error('Invalid proctoring LLM summary response');
    }
    return {
      summaryText: value.summaryText,
      riskFacts: value.riskFacts as ProctoringLlmSummaryResponse['riskFacts'],
      citations: value.citations as ProctoringLlmSummaryResponse['citations'],
      missingDataNotes: value.missingDataNotes as string[],
      modelNotes: value.modelNotes as string[],
      guardRailWarnings: Array.isArray(value.guardRailWarnings)
        ? (value.guardRailWarnings as string[])
        : [],
      validationStatus: value.validationStatus,
      validationScore: typeof value.validationScore === 'number' ? value.validationScore : undefined,
      validationErrors: Array.isArray(value.validationErrors)
        ? (value.validationErrors as string[])
        : [],
      modelVersion: value.modelVersion,
      judgeModelVersion:
        typeof value.judgeModelVersion === 'string' ? value.judgeModelVersion : undefined,
      promptVersion: value.promptVersion,
      outputSchemaVersion: value.outputSchemaVersion,
    };
  }
}
