import { ExamProctoringEventEntity } from '@backend/shared/db/schema';

export type ProctoringRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ProctoringRiskPolicy = {
  eventWeights?: Record<string, number>;
  eventCaps?: Record<string, number>;
  riskThresholds?: Partial<Record<ProctoringRiskLevel, number>>;
  velocityWindowSeconds?: number;
  velocityPointPerExtraEvent?: number;
  velocityCap?: number;
};

export type ProctoringRiskComputation = {
  riskScore: number;
  riskLevel: ProctoringRiskLevel;
  eventScore: number;
  velocityScore: number;
  eventCountsJson: Record<string, number>;
  velocityJson: {
    windowSeconds: number;
    maxEventsInWindow: number;
    score: number;
    windowStart: string | null;
    windowEnd: string | null;
  };
};

type RiskEvent = Pick<ExamProctoringEventEntity, 'type' | 'payloadJson' | 'capturedAt' | 'clientSeq'>;

const DEFAULT_EVENT_WEIGHTS: Record<string, number> = {
  heartbeat: 0,
  final_flush: 0,
  'final_flush.request': 0,
  camera_started: 0,
  camera_track_unmuted: 0,
  camera_stopped: 6,
  camera_permission_denied: 6,
  camera_track_muted: 6,
  camera_error: 6,
  focus_change: 8,
  visibility_change: 8,
  clipboard_event: 10,
  fullscreen_change: 12,
  screen_share_change: 16,
};

const DEFAULT_EVENT_CAPS: Record<string, number> = {
  heartbeat: 0,
  final_flush: 0,
  'final_flush.request': 0,
  camera_started: 0,
  camera_track_unmuted: 0,
  camera_stopped: 18,
  camera_permission_denied: 18,
  camera_track_muted: 18,
  camera_error: 18,
  focus_change: 24,
  visibility_change: 32,
  clipboard_event: 30,
  fullscreen_change: 36,
  screen_share_change: 32,
};

const DEFAULT_THRESHOLDS: Record<ProctoringRiskLevel, number> = {
  low: 0,
  medium: 25,
  high: 50,
  critical: 85,
};

function compareByCapturedAtThenSeq(a: RiskEvent, b: RiskEvent): number {
  const capturedDiff = a.capturedAt.getTime() - b.capturedAt.getTime();
  if (capturedDiff !== 0) {
    return capturedDiff;
  }
  return a.clientSeq - b.clientSeq;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export class ProctoringRiskService {
  compute(events: RiskEvent[], policy: ProctoringRiskPolicy = {}): ProctoringRiskComputation {
    const orderedEvents = [...events].sort(compareByCapturedAtThenSeq);
    const eventWeights = { ...DEFAULT_EVENT_WEIGHTS, ...(policy.eventWeights ?? {}) };
    const eventCaps = { ...DEFAULT_EVENT_CAPS, ...(policy.eventCaps ?? {}) };
    const thresholds = { ...DEFAULT_THRESHOLDS, ...(policy.riskThresholds ?? {}) };
    const eventCountsJson = this.countEvents(orderedEvents);
    const eventScore = this.computeEventScore(eventCountsJson, eventWeights, eventCaps);
    const velocityJson = this.computeVelocity(orderedEvents, policy);
    const velocityScore = velocityJson.score;
    const riskScore = clampScore(eventScore + velocityScore);

    return {
      riskScore,
      riskLevel: this.levelForScore(riskScore, thresholds),
      eventScore,
      velocityScore,
      eventCountsJson,
      velocityJson,
    };
  }

  private countEvents(events: RiskEvent[]): Record<string, number> {
    return events.reduce<Record<string, number>>((acc, event) => {
      const eventName = this.getRiskEventName(event);
      acc[eventName] = (acc[eventName] ?? 0) + 1;
      return acc;
    }, {});
  }

  private getRiskEventName(event: RiskEvent): string {
    const payload = event.payloadJson;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const eventName = (payload as Record<string, unknown>).eventName;
      if (typeof eventName === 'string' && eventName.trim()) {
        return eventName;
      }
    }

    return event.type;
  }

  private computeEventScore(
    counts: Record<string, number>,
    weights: Record<string, number>,
    caps: Record<string, number>
  ): number {
    return Object.entries(counts).reduce((total, [type, count]) => {
      const weighted = count * (weights[type] ?? 2);
      return total + Math.min(weighted, caps[type] ?? 10);
    }, 0);
  }

  private computeVelocity(
    events: RiskEvent[],
    policy: ProctoringRiskPolicy
  ): ProctoringRiskComputation['velocityJson'] {
    const windowSeconds = policy.velocityWindowSeconds ?? 300;
    const pointPerExtraEvent = policy.velocityPointPerExtraEvent ?? 5;
    const velocityCap = policy.velocityCap ?? 20;
    const windowMs = windowSeconds * 1000;
    let bestStart: Date | null = null;
    let bestCount = 0;

    for (let left = 0; left < events.length; left += 1) {
      const start = events[left]?.capturedAt;
      if (!start) {
        continue;
      }
      const endTime = start.getTime() + windowMs;
      let count = 0;
      for (let right = left; right < events.length; right += 1) {
        const event = events[right];
        if (!event || event.capturedAt.getTime() > endTime) {
          break;
        }
        count += 1;
      }
      if (count > bestCount) {
        bestCount = count;
        bestStart = start;
      }
    }

    const score = Math.min(velocityCap, Math.max(0, bestCount - 1) * pointPerExtraEvent);
    const bestEnd = bestStart ? new Date(bestStart.getTime() + windowMs) : null;

    return {
      windowSeconds,
      maxEventsInWindow: bestCount,
      score,
      windowStart: bestStart?.toISOString() ?? null,
      windowEnd: bestEnd?.toISOString() ?? null,
    };
  }

  private levelForScore(
    score: number,
    thresholds: Record<ProctoringRiskLevel, number>
  ): ProctoringRiskLevel {
    if (score >= thresholds.critical) {
      return 'critical';
    }
    if (score >= thresholds.high) {
      return 'high';
    }
    if (score >= thresholds.medium) {
      return 'medium';
    }
    return 'low';
  }
}
