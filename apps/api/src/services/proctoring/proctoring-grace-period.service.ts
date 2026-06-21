import {
  createProctoringRedisService,
  ProctoringDeadline,
  ProctoringRedisService,
} from './proctoring-redis.service';

type ProctoringGracePeriodServiceDependencies = {
  redisService: Pick<
    ProctoringRedisService,
    'setDeadline' | 'clearDeadline' | 'getDeadline'
  >;
};

export type ScheduleMissedHeartbeatDeadlineInput = {
  participationId: string;
  heartbeatIntervalSeconds: number;
  missedHeartbeatGraceMultiplier: number;
  now?: Date;
};

export type DeadlineEvaluation = {
  participationId: string;
  expired: boolean;
  misconductEvidence: false;
  operationalIncident: boolean;
  reason: string;
  deadline?: ProctoringDeadline;
};

export class ProctoringGracePeriodService {
  constructor(private readonly deps: ProctoringGracePeriodServiceDependencies) {}

  async scheduleMissedHeartbeatDeadline(
    input: ScheduleMissedHeartbeatDeadlineInput,
  ): Promise<ProctoringDeadline> {
    const now = input.now ?? new Date();
    const graceMs =
      input.heartbeatIntervalSeconds * input.missedHeartbeatGraceMultiplier * 1000;
    const deadline: ProctoringDeadline = {
      participationId: input.participationId,
      deadlineType: 'missed_heartbeat',
      deadlineAt: new Date(now.getTime() + graceMs),
    };

    await this.deps.redisService.setDeadline({ ...deadline, now });
    return deadline;
  }

  async clearDeadline(participationId: string): Promise<void> {
    await this.deps.redisService.clearDeadline(participationId);
  }

  async evaluateDeadline(input: {
    participationId: string;
    now?: Date;
  }): Promise<DeadlineEvaluation> {
    const now = input.now ?? new Date();

    try {
      const deadline = await this.deps.redisService.getDeadline(input.participationId);
      if (!deadline) {
        return {
          participationId: input.participationId,
          expired: false,
          misconductEvidence: false,
          operationalIncident: false,
          reason: 'live_state_missing',
        };
      }

      return {
        participationId: input.participationId,
        expired: deadline.deadlineAt.getTime() <= now.getTime(),
        misconductEvidence: false,
        operationalIncident: false,
        reason: deadline.deadlineType,
        deadline,
      };
    } catch {
      return {
        participationId: input.participationId,
        expired: false,
        misconductEvidence: false,
        operationalIncident: true,
        reason: 'redis_unavailable',
      };
    }
  }
}

export function createProctoringGracePeriodService(): ProctoringGracePeriodService {
  return new ProctoringGracePeriodService({
    redisService: createProctoringRedisService(),
  });
}
