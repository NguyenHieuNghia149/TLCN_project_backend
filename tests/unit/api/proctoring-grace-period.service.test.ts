describe('ProctoringGracePeriodService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('stores missed-heartbeat grace deadlines in server-owned Redis TTL keys', async () => {
    const {
      ProctoringGracePeriodService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-grace-period.service');
    const redisService = {
      setDeadline: jest.fn().mockResolvedValue(undefined),
      clearDeadline: jest.fn().mockResolvedValue(undefined),
      getDeadline: jest.fn(),
    };
    const service = new ProctoringGracePeriodService({ redisService });
    const now = new Date('2026-06-11T10:00:00.000Z');

    const result = await service.scheduleMissedHeartbeatDeadline({
      participationId: 'participation-1',
      heartbeatIntervalSeconds: 10,
      missedHeartbeatGraceMultiplier: 3,
      now,
    });

    expect(result).toEqual({
      participationId: 'participation-1',
      deadlineType: 'missed_heartbeat',
      deadlineAt: new Date('2026-06-11T10:00:30.000Z'),
    });
    expect(redisService.setDeadline).toHaveBeenCalledWith({
      participationId: 'participation-1',
      deadlineType: 'missed_heartbeat',
      deadlineAt: new Date('2026-06-11T10:00:30.000Z'),
      now,
    });
  });

  it('treats missing live-state as non-evidence instead of misconduct evidence', async () => {
    const {
      ProctoringGracePeriodService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-grace-period.service');
    const service = new ProctoringGracePeriodService({
      redisService: {
        setDeadline: jest.fn(),
        clearDeadline: jest.fn(),
        getDeadline: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.evaluateDeadline({
        participationId: 'participation-1',
        now: new Date('2026-06-11T10:01:00.000Z'),
      }),
    ).resolves.toEqual({
      participationId: 'participation-1',
      expired: false,
      misconductEvidence: false,
      operationalIncident: false,
      reason: 'live_state_missing',
    });
  });

  it('classifies Redis outage as an operational incident, not candidate misconduct evidence', async () => {
    const {
      ProctoringGracePeriodService,
    } = require('../../../apps/api/src/services/proctoring/proctoring-grace-period.service');
    const service = new ProctoringGracePeriodService({
      redisService: {
        setDeadline: jest.fn(),
        clearDeadline: jest.fn(),
        getDeadline: jest.fn().mockRejectedValue(new Error('redis down')),
      },
    });

    await expect(
      service.evaluateDeadline({
        participationId: 'participation-1',
        now: new Date('2026-06-11T10:01:00.000Z'),
      }),
    ).resolves.toEqual({
      participationId: 'participation-1',
      expired: false,
      misconductEvidence: false,
      operationalIncident: true,
      reason: 'redis_unavailable',
    });
  });
});
