import crypto from 'node:crypto';

describe('Proctoring Security — forbidden payloads, bypass code leak, accusation language', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /* ───── P1.T10.1 — Forbidden payload rejection ───── */

  describe('forbidden telemetry payload fields are rejected', () => {
    const loadValidator = () => {
      const mod = require('../../../apps/api/src/services/proctoring/proctoring-event-validator.service');
      return new mod.ProctoringEventValidatorService();
    };

    it('rejects rawmedia at top level', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.batch',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 1,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { rawmedia: 'base64...' },
        }),
      ).toThrow(/forbidden/i);
    });

    it('rejects clipboardtext top-level field', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.urgent',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 2,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { clipboardText: 'secret' },
        }),
      ).toThrow(/forbidden/i);
    });

    it('rejects rawclipboardtext', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.batch',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 3,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { rawClipboardText: 'pasted code' },
        }),
      ).toThrow(/forbidden/i);
    });

    it('rejects keystrokecontent', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.batch',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 4,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { keystrokeContent: 'typed text' },
        }),
      ).toThrow(/forbidden/i);
    });

    it('rejects sourcecode field', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.batch',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 5,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { sourceCode: 'console.log(1)' },
        }),
      ).toThrow(/forbidden/i);
    });

    it('rejects nested forbidden fields', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.batch',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 6,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: {
            eventMeta: { nested: { keystrokes: 'abc' } },
          },
        }),
      ).toThrow(/forbidden/i);
    });

    it('accepts allowlisted payload fields like eventName and textLength', () => {
      expect(() =>
        loadValidator().validateTelemetryFrame({
          type: 'telemetry.batch',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 7,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: { eventName: 'paste', textLength: 12 },
        }),
      ).not.toThrow();
    });

    it('rejects raw clipboard and media even when passed through sanitizeTelemetryPayload', () => {
      const { sanitizeTelemetryPayload } = require('../../../apps/api/src/services/proctoring/proctoring-redis.service');
      const result = sanitizeTelemetryPayload({
        eventName: 'paste',
        clipboardText: 'secret',
        rawClipboardText: 'secret',
        media: 'blob',
        nested: { videodata: 'xyz' },
        safeField: 'keep',
      });
      expect(result).not.toHaveProperty('clipboardText');
      expect(result).not.toHaveProperty('rawClipboardText');
      expect(result).not.toHaveProperty('media');
      expect(result.nested).not.toHaveProperty('videodata');
      expect(result.safeField).toBe('keep');
    });
  });

  /* ───── P1.T10.2 — Raw bypass codes never leaked after creation ───── */

  describe('bypass code security — hash-only storage, no leak after creation', () => {
    const loadBypassService = () => {
      const mod = require('../../../apps/api/src/services/proctoring/proctoring-bypass.service');
      return mod;
    };

    it('issueBypassCode stores a hash, never the raw code', async () => {
      const { ProctoringBypassService } = loadBypassService();
      const insert = jest.fn().mockResolvedValue({
        id: 'bypass-1',
        status: 'issued',
        expiresAt: new Date('2026-06-13T00:00:00.000Z'),
      });

      const service = new ProctoringBypassService({
        bypassRepository: {
          insert,
          findIssuedForVerification: jest.fn(),
          findUsedGrant: jest.fn(),
          markUsed: jest.fn(),
          incrementFailedAttempts: jest.fn(),
        },
        generateCode: () => 'RAW-CODE-1',
        hashCode: (code: string, binding: any) =>
          crypto.createHash('sha256').update(`${code}|${binding.examId}|${binding.participationId ?? ''}|${binding.entrySessionId ?? ''}|${binding.clientSessionId}`).digest('hex'),
      });

      const result = await service.issueBypassCode('exam-1', 'admin-1', {
        reason: 'test bypass',
        clientSessionId: 'client-1',
        participationId: 'participation-1',
      });

      expect(result.code).toBe('RAW-CODE-1');
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          codeHash: expect.any(String),
          reason: 'test bypass',
        }),
      );
      const callArg = insert.mock.calls[0][0];
      expect(callArg.codeHash).not.toBe('RAW-CODE-1');
      expect(callArg.codeHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('verifyBypassCode never returns the raw code', async () => {
      const { ProctoringBypassService } = loadBypassService();
      const bypassRepository = {
        insert: jest.fn(),
        findById: jest.fn(),
        findIssuedForVerification: jest.fn().mockResolvedValue({
          id: 'bypass-1',
          examId: 'exam-1',
          participationId: 'participation-1',
          entrySessionId: null,
          clientSessionId: 'client-1',
          codeHash: crypto.createHash('sha256').update('RAW-CODE-1|exam-1|participation-1||client-1').digest('hex'),
          status: 'issued',
          expiresAt: new Date('2026-06-13T00:00:00.000Z'),
        }),
        findUsedGrant: jest.fn(),
        markUsed: jest.fn().mockResolvedValue({
          id: 'bypass-1',
          status: 'used',
          expiresAt: new Date('2026-06-13T00:00:00.000Z'),
        }),
        incrementFailedAttempts: jest.fn(),
      };

      const service = new ProctoringBypassService({
        bypassRepository,
        hashCode: (code: string, binding: any) =>
          crypto.createHash('sha256').update(`${code}|${binding.examId}|${binding.participationId ?? ''}|${binding.entrySessionId ?? ''}|${binding.clientSessionId}`).digest('hex'),
      });

      const result = await service.verifyBypassCode('exam-1', 'user-1', {
        bypassCode: 'RAW-CODE-1',
        clientSessionId: 'client-1',
        participationId: 'participation-1',
      });

      expect(result).toMatchObject({
        bypassCodeId: 'bypass-1',
        status: 'used',
      });
      expect(result).not.toHaveProperty('code');
    });

    it('findUsedGrant returns only grant metadata, never raw code', async () => {
      const { ProctoringBypassService } = loadBypassService();
      const bypassRepository = {
        insert: jest.fn(),
        findById: jest.fn(),
        findIssuedForVerification: jest.fn(),
        findUsedGrant: jest.fn().mockResolvedValue({
          id: 'bypass-1',
          examId: 'exam-1',
          participationId: 'participation-1',
          codeHash: 'somehash',
          status: 'used',
        }),
        markUsed: jest.fn(),
        incrementFailedAttempts: jest.fn(),
      };

      const service = new ProctoringBypassService({
        bypassRepository,
      });

      const grant = await service.findReusableGrant({
        bypassCodeId: 'bypass-1',
        examId: 'exam-1',
        candidateUserId: 'user-1',
      });

      expect(grant).toBeTruthy();
      expect(grant).not.toHaveProperty('code');
      expect(grant).toHaveProperty('codeHash', 'somehash');
    });

    it('admin bypass-codes POST endpoint response includes raw code only at creation', async () => {
      const { ProctoringBypassService } = loadBypassService();
      const insert = jest.fn().mockResolvedValue({
        id: 'bypass-1',
        status: 'issued',
        expiresAt: new Date('2026-06-13T00:00:00.000Z'),
      });

      const service = new ProctoringBypassService({
        bypassRepository: {
          insert,
          findIssuedForVerification: jest.fn(),
          findUsedGrant: jest.fn(),
          markUsed: jest.fn(),
          incrementFailedAttempts: jest.fn(),
        },
        generateCode: () => 'ONETIME-CODE',
      });

      const result = await service.issueBypassCode('exam-1', 'admin-1', {
        reason: 'hardware issue',
        clientSessionId: 'client-1',
        participationId: 'participation-1',
      });

      expect(result).toHaveProperty('code', 'ONETIME-CODE');
      expect(result).toHaveProperty('bypassCodeId', 'bypass-1');
      expect(result).toHaveProperty('status', 'issued');
    });

    it('admin review GET endpoint never returns bypass codeHash or raw code', async () => {
      const { ProctoringAdminReviewService } = require('../../../apps/api/src/services/proctoring/proctoring-admin-review.service');
      const summaryRepository = {
        findByParticipation: jest.fn().mockResolvedValue({
          id: 'summary-1', examId: 'exam-1', participationId: 'participation-1',
          riskScore: 0, riskLevel: 'low', eventCountsJson: {}, velocityJson: {},
          finalFlushStatus: null, deterministicSchemaVersion: 'v1', computedAt: new Date(),
          reviewerDecision: 'pending',
        }),
        updateReviewerDecision: jest.fn(),
      };
      const eventRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
      const consentRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
      const precheckRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
      const bypassRepository = {
        findByParticipation: jest.fn().mockResolvedValue([
          { id: 'bypass-1', status: 'used', reason: 'test', issuedByUserId: 'admin-1',
            codeHash: 'should-not-leak' },
        ]),
      };
      const finalFlushRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
      const dataRequestRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
      const summaryService = { recomputeForParticipation: jest.fn() };
      const auditLogRepository = { create: jest.fn() };
      const examRepository = {
        findById: jest.fn().mockResolvedValue({ id: 'exam-1', createdBy: 'teacher-1' }),
      };
      const participationRepository = {
        findById: jest.fn().mockResolvedValue({ id: 'participation-1', examId: 'exam-1' }),
      };

      const service = new ProctoringAdminReviewService({
        examRepository, participationRepository, summaryRepository, eventRepository,
        consentRepository, precheckRepository, bypassRepository, finalFlushRepository,
        dataRequestRepository, summaryService, auditLogRepository,
      });

      const review = await service.getReview('exam-1', 'participation-1', {
        userId: 'teacher-1', role: 'teacher',
      });

      const serialized = JSON.stringify(review);
      expect(serialized).not.toContain('codeHash');
      expect(serialized).not.toContain('RAW-CODE');
      expect(review.evidence.bypass).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'bypass-1', status: 'used' }),
        ]),
      );
    });
  });

  /* ───── Failure-mode: Redis append failure returns retry_required ───── */

  describe('P1.T10.5 — Redis append failure returns retry_required', () => {
    it('websocket service emits telemetry.retry_required when Redis append fails', async () => {
      const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');

      const handlers: Record<string, (...args: any[]) => void> = {};
      const namespace: any = {
        on: jest.fn((event: string, listener: (...args: any[]) => void) => {
          handlers[event] = listener;
          return namespace;
        }),
        emit: jest.fn().mockReturnValue(true),
        to: jest.fn(() => ({ emit: jest.fn().mockReturnValue(true) })),
      };

      const redisService = {
        upsertSessionState: jest.fn().mockResolvedValue(undefined),
        appendTelemetryEvent: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
      };

      const validator = {
        validateSessionHello: jest.fn().mockReturnValue({
          participationId: 'p1', clientSessionId: 'c1', userId: 'u1', lastSeenClientSeq: 0,
        }),
        validateTelemetryFrame: jest.fn().mockImplementation((frame: any) => ({
          ...frame, participationId: 'p1', clientSessionId: 'c1',
        })),
        validateFinalFlushRequest: jest.fn(),
      };

      const rateLimitService = {
        allowBatch: jest.fn().mockReturnValue({ allowed: true }),
        isStaleBufferedEvent: jest.fn().mockReturnValue(false),
      };

      new ProctoringWebSocketService({ namespace, redisService, validator, rateLimitService });

      const socket = {
        id: 'socket-1',
        on: jest.fn(),
        emit: jest.fn().mockReturnValue(true),
        join: jest.fn(),
        disconnect: jest.fn(),
        handlers: {} as Record<string, (...args: any[]) => void>,
      };
      socket.on = jest.fn((event: string, listener: (...args: any[]) => void) => {
        socket.handlers[event] = listener;
        return socket;
      });
      handlers.connection!(socket);
      await socket.handlers['session.hello']?.({ participationId: 'p1', clientSessionId: 'c1', userId: 'u1', lastSeenClientSeq: 0 });

      await socket.handlers['telemetry.urgent']?.({
        participationId: 'p1',
        clientSessionId: 'c1',
        event: {
          type: 'telemetry.urgent',
          participationId: 'p1',
          clientSessionId: 'c1',
          clientSeq: 1,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1,
          severity: 'info',
          payloadJson: {},
        },
      });

      expect(socket.emit).toHaveBeenCalledWith(
        'telemetry.retry_required',
        expect.objectContaining({ reason: 'Redis connection refused' }),
      );
    });
  });

  /* ───── Failure-mode: PostgreSQL persister failure retries ───── */

  describe('P1.T10.8 — PostgreSQL persister failure does not XACK and dead-letters', () => {
    it('persister dead-letters malformed entries and xacks them', async () => {
      jest.resetModules();
      const { ProctoringTelemetryPersisterService } = require('../../../apps/api/src/services/proctoring/proctoring-telemetry-persister.service');

      const xack = jest.fn().mockResolvedValue(1);
      const xadd = jest.fn().mockResolvedValue('dead-letter-id');
      const redis = {
        xgroup: jest.fn().mockResolvedValue(undefined),
        xreadgroup: jest.fn().mockResolvedValue(null),
        xautoclaim: jest.fn().mockResolvedValue(['0-0', [
          ['1-0', ['event', '{invalid']],
        ]] as any),
        xack,
        xadd,
      };

      const eventRepo = {
        bulkInsertDedupe: jest.fn().mockRejectedValue(new Error('DB unavailable')),
      };
      const finalFlushRepo = {
        transitionStatus: jest.fn().mockResolvedValue(undefined),
      };

      const persister = new ProctoringTelemetryPersisterService({
        redis,
        redisService: { getClient: jest.fn().mockResolvedValue(redis) },
        eventRepository: eventRepo,
        finalFlushRepository: finalFlushRepo,
        batchSize: 100,
        minIdleMs: 1000,
      });

      await persister.bootstrapConsumerGroup();
      const result = await persister.recoverPendingOnce();

      expect(result.deadLetterCount).toBeGreaterThan(0);
      expect(xack).toHaveBeenCalled();
    });

    it('persister handles DB unavailable gracefully — batch returns 0 processed', async () => {
      jest.resetModules();
      const { ProctoringTelemetryPersisterService } = require('../../../apps/api/src/services/proctoring/proctoring-telemetry-persister.service');

      const validEvent = JSON.stringify({
        id: 'evt-1', examId: 'exam-1', participationId: 'p1',
        sessionId: 's1', entrySessionId: null, candidateUserId: 'u1',
        clientSessionId: 'c1', clientSeq: 1, type: 'heartbeat',
        severity: 'info', schemaVersion: 1, payloadJson: {},
        capturedAt: '2026-06-12T10:00:00.000Z',
        receivedAt: '2026-06-12T10:00:01.000Z',
        buffered: false,
      });

      const xack = jest.fn().mockResolvedValue(1);
      const redis = {
        xgroup: jest.fn().mockResolvedValue(undefined),
        xreadgroup: jest.fn().mockResolvedValue([
          ['proctoring:telemetry:stream:0', [
            ['1-0', ['event', validEvent]],
          ]],
        ] as any),
        xautoclaim: jest.fn().mockResolvedValue(['0-0', []] as any),
        xack,
        xadd: jest.fn(),
      };

      const eventRepo = {
        bulkInsertDedupe: jest.fn().mockRejectedValue(new Error('DB write failed')),
      };
      const finalFlushRepo = {
        transitionStatus: jest.fn().mockResolvedValue(undefined),
      };

      const persister = new ProctoringTelemetryPersisterService({
        redis,
        redisService: { getClient: jest.fn().mockResolvedValue(redis) },
        eventRepository: eventRepo,
        finalFlushRepository: finalFlushRepo,
        batchSize: 100,
        blockMs: 100,
      });

      await persister.bootstrapConsumerGroup();
      const result = await persister.processBatchOnce();

      expect(result.processedCount).toBe(0);
      expect(xack).not.toHaveBeenCalled();
    });
  });

  /* ───── Failure-mode: AI worker failure does not block submit ───── */

  describe('P1.T10.9 — AI worker failure does not block submit', () => {
    it('submit guard completes when AI is unavailable (no AI dependency in guard)', async () => {
      const { ProctoringSubmitGuardService } = require('../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');
      const finalFlushRepository = {
        findById: jest.fn().mockResolvedValue(null),
        findByParticipationAndSubmitAttempt: jest.fn().mockResolvedValue({
          id: 'receipt-1',
          status: 'persisted',
        }),
        transitionStatus: jest.fn(),
      };
      const summaryService = { recomputeForParticipation: jest.fn() };

      const guard = new ProctoringSubmitGuardService({
        finalFlushRepository,
        summaryService,
      });

      const result = await guard.awaitFinalFlushReceipt({
        participationId: 'p1',
        submitAttemptId: 'attempt-1',
      });

      expect(result.status).toBe('persisted');
      expect(finalFlushRepository.findByParticipationAndSubmitAttempt).toHaveBeenCalled();
    });

    it('the submit guard service has no AI dependency in its constructor', () => {
      const { ProctoringSubmitGuardService } = require('../../../apps/api/src/services/proctoring/proctoring-submit-guard.service');
      const guard = new ProctoringSubmitGuardService({
        finalFlushRepository: {
          findById: jest.fn(),
          findByParticipationAndSubmitAttempt: jest.fn(),
          transitionStatus: jest.fn(),
        },
        summaryService: { recomputeForParticipation: jest.fn() },
      });
      const deps = Object.getOwnPropertyNames(guard);
      expect(deps).not.toContain('aiJobService');
      expect(deps).not.toContain('aiService');
    });
  });

  /* ───── P1.T10.6 — Redis buffer outage at start ───── */

  describe('P1.T10.6 — Redis buffer outage at start returns PROCTORING_BUFFER_UNAVAILABLE', () => {
    it('start gate throws ProctoringBufferUnavailableError when buffer is unhealthy', async () => {
      const { ProctoringStartGateService } = require('../../../apps/api/src/services/proctoring/proctoring-start-gate.service');

      const deps = {
        settingsRepository: {
          findByExamId: jest.fn().mockResolvedValue({
            id: 'settings-1', examId: 'exam-1', enabled: true,
          }),
        },
        consentRepository: { findById: jest.fn() },
        precheckRepository: { findById: jest.fn(), findValidPassedById: jest.fn() },
        bypassRepository: { findUsedGrant: jest.fn() },
        sessionRepository: { insert: jest.fn() },
        isBufferHealthy: jest.fn().mockResolvedValue(false),
      };

      const service = new ProctoringStartGateService(deps);

      await expect(
        service.validateStartRequest({
          exam: { id: 'exam-1' },
          entrySession: { id: 'entry-1' },
          participant: { id: 'participant-1' },
          userId: 'user-1',
          proctoring: { clientSessionId: 'c1', consentRecordId: 'consent-1' },
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
        code: 'PROCTORING_BUFFER_UNAVAILABLE',
      });
    });

    it('start gate succeeds when buffer is healthy', async () => {
      const { ProctoringStartGateService } = require('../../../apps/api/src/services/proctoring/proctoring-start-gate.service');

      const deps = {
        settingsRepository: {
          findByExamId: jest.fn().mockResolvedValue({
            id: 'settings-1', examId: 'exam-1', enabled: true,
          }),
        },
        consentRepository: {
          findById: jest.fn().mockResolvedValue({
            id: 'consent-1', status: 'accepted', examId: 'exam-1',
            candidateUserId: 'user-1', clientSessionId: 'c1',
          }),
        },
        precheckRepository: {
          findById: jest.fn(),
          findValidPassedById: jest.fn().mockResolvedValue({
            id: 'precheck-1', examId: 'exam-1', candidateUserId: 'user-1',
            clientSessionId: 'c1', consentRecordId: 'consent-1',
            expiresAt: new Date(Date.now() + 300_000),
          }),
        },
        bypassRepository: { findUsedGrant: jest.fn() },
        sessionRepository: { insert: jest.fn() },
        isBufferHealthy: jest.fn().mockResolvedValue(true),
      };

      const service = new ProctoringStartGateService(deps);

      const result = await service.validateStartRequest({
        exam: { id: 'exam-1' },
        entrySession: { id: 'entry-1' },
        participant: { id: 'participant-1' },
        userId: 'user-1',
        proctoring: { clientSessionId: 'c1', consentRecordId: 'consent-1', precheckId: 'precheck-1' },
      });

      expect(result.proctoringRequired).toBe(true);
    });

    it('ProctoringBufferUnavailableError is retryable (503 status)', () => {
      const { ProctoringBufferUnavailableError } = require('../../../apps/api/src/services/proctoring/proctoring-start-gate.service');
      const error = new ProctoringBufferUnavailableError();
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('PROCTORING_BUFFER_UNAVAILABLE');
    });
  });

  /* ───── P1.T10.7 — Prolonged Redis buffer outage does not auto-invalidate ───── */

  describe('P1.T10.7 — Prolonged Redis buffer outage during active session does not auto-invalidate', () => {
    it('websocket emits retry_required but does not suspend the session', async () => {
      const { ProctoringWebSocketService } = require('../../../apps/api/src/services/proctoring/proctoring-websocket.service');

      const handlers: Record<string, (...args: any[]) => void> = {};
      const namespace: any = {
        on: jest.fn((event: string, listener: (...args: any[]) => void) => {
          handlers[event] = listener;
          return namespace;
        }),
        emit: jest.fn().mockReturnValue(true),
        to: jest.fn(() => ({ emit: jest.fn().mockReturnValue(true) })),
      };

      const redisService = {
        upsertSessionState: jest.fn().mockResolvedValue(undefined),
        appendTelemetryEvent: jest.fn().mockRejectedValue(new Error('Redis persistent outage')),
      };

      const validator = {
        validateSessionHello: jest.fn().mockReturnValue({
          participationId: 'p1', clientSessionId: 'c1', userId: 'u1', lastSeenClientSeq: 0,
        }),
        validateTelemetryFrame: jest.fn().mockImplementation((f: any) => ({
          ...f, participationId: 'p1', clientSessionId: 'c1',
        })),
        validateFinalFlushRequest: jest.fn(),
      };

      const rateLimitService = {
        allowBatch: jest.fn().mockReturnValue({ allowed: true }),
        isStaleBufferedEvent: jest.fn().mockReturnValue(false),
      };

      new ProctoringWebSocketService({ namespace, redisService, validator, rateLimitService });

      const socket = {
        id: 'socket-1', on: jest.fn(), emit: jest.fn().mockReturnValue(true),
        join: jest.fn(), disconnect: jest.fn(),
        handlers: {} as Record<string, (...args: any[]) => void>,
      };
      socket.on = jest.fn((event: string, listener: (...args: any[]) => void) => {
        socket.handlers[event] = listener;
        return socket;
      });
      handlers.connection!(socket);
      await socket.handlers['session.hello']?.({ participationId: 'p1', clientSessionId: 'c1', userId: 'u1', lastSeenClientSeq: 0 });

      await socket.handlers['telemetry.urgent']?.({
        participationId: 'p1', clientSessionId: 'c1',
        event: {
          type: 'telemetry.urgent', participationId: 'p1',
          clientSessionId: 'c1', clientSeq: 1,
          capturedAt: '2026-06-12T10:00:00.000Z',
          receivedAt: '2026-06-12T10:00:01.000Z',
          schemaVersion: 1, severity: 'info',
          payloadJson: {},
        },
      });

      expect(socket.emit).toHaveBeenCalledWith(
        'telemetry.retry_required',
        expect.any(Object),
      );
      expect(socket.emit).not.toHaveBeenCalledWith(
        'session.suspended',
        expect.any(Object),
      );
    });
  });
});
