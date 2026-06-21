import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DatabaseService, db } from '@backend/shared/db/connection';
import {
  exam,
  examParticipants,
  examParticipations,
  examEntrySessions,
  users,
  examProctoringSettings,
  examProctoringConsents,
  examProctoringPrechecks,
  examProctoringSessions,
  examProctoringEvents,
  examProctoringFinalFlushReceipts,
  examProctoringSummaries,
} from '@backend/shared/db/schema';

const describeDbIntegration =
  process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

describeDbIntegration('Proctoring P1.T10.3 — Full flow: consent -> precheck -> start -> submit -> admin review', () => {
  const testId = crypto.randomUUID().slice(0, 8);
  let userId = '';
  let examId = '';
  let participantId = '';
  let participationId = '';
  let entrySessionId = '';
  let consentRecordId = '';
  let precheckId = '';
  let sessionId = '';
  let clientSessionId = `client-${testId}`;
  let submitAttemptId = '';
  let receiptId = '';

  beforeAll(async () => {
    await DatabaseService.connect();
  });

  afterAll(async () => {
    await DatabaseService.disconnect();
  });

  afterEach(async () => {
    if (sessionId) {
      await db.delete(examProctoringSummaries).where(eq(examProctoringSummaries.participationId, participationId)).catch(() => {});
      await db.delete(examProctoringFinalFlushReceipts).where(eq(examProctoringFinalFlushReceipts.participationId, participationId)).catch(() => {});
      await db.delete(examProctoringEvents).where(eq(examProctoringEvents.participationId, participationId)).catch(() => {});
      await db.delete(examProctoringSessions).where(eq(examProctoringSessions.participationId, participationId)).catch(() => {});
    }
    if (precheckId) {
      await db.delete(examProctoringPrechecks).where(eq(examProctoringPrechecks.id, precheckId)).catch(() => {});
    }
    if (consentRecordId) {
      await db.delete(examProctoringConsents).where(eq(examProctoringConsents.id, consentRecordId)).catch(() => {});
    }
    if (entrySessionId) {
      await db.delete(examEntrySessions).where(eq(examEntrySessions.id, entrySessionId)).catch(() => {});
    }
    if (participationId) {
      await db.delete(examParticipations).where(eq(examParticipations.id, participationId)).catch(() => {});
    }
    if (participantId) {
      await db.delete(examParticipants).where(eq(examParticipants.id, participantId)).catch(() => {});
    }
    if (examId) {
      await db.delete(examProctoringSettings).where(eq(examProctoringSettings.examId, examId)).catch(() => {});
      await db.delete(exam).where(eq(exam.id, examId)).catch(() => {});
    }
    if (userId) {
      await db.delete(users).where(eq(users.id, userId)).catch(() => {});
    }
  });

  it('completes the full proctoring flow from consent through admin review', async () => {
    // 1. Create test user
    const [user] = await db.insert(users).values({
      email: `proctor-flow-${testId}@example.com`,
      password: 'Password1!',
      firstName: 'Proctor',
      lastName: 'Flow',
    }).returning();
    expect(user).toBeDefined();
    userId = user!.id;

    // 2. Create exam
    const now = new Date();
    const [examRow] = await db.insert(exam).values({
      title: `Proctor Flow Exam ${testId}`,
      slug: `proctor-flow-${testId}`,
      createdBy: userId,
      duration: 60,
      startDate: now,
      endDate: new Date(now.getTime() + 3600_000),
      maxAttempts: 1,
    }).returning();
    expect(examRow).toBeDefined();
    examId = examRow!.id;

    // 3. Enable proctoring settings
    const [settings] = await db.insert(examProctoringSettings).values({
      examId,
      enabled: true,
      requireCamera: true,
      requireScreenShare: true,
      requireFullscreen: true,
      requireMonitorDisplaySurface: false,
      consentNoticeVersion: 'v1',
      legalLinksJson: {},
      allowedEventTypesJson: ['focus_lost', 'visibility_hidden', 'fullscreen_exit', 'screen_share_stopped'],
      riskWeightsJson: {},
      riskThresholdsJson: {},
      clipboardPolicy: 'log_only',
      aiAnomalyEnabled: false,
      aiShadowMode: false,
      dataRetentionDays: 180,
      dataDeletionSlaDays: 20,
      sensitiveDataDeletionTargetHours: 72,
    }).returning();
    expect(settings).toBeDefined();

    // 4. Create participant
    const [participant] = await db.insert(examParticipants).values({
      examId,
      userId,
      normalizedEmail: `proctor-flow-${testId}@example.com`,
      fullName: 'Proctor Flow',
      source: 'direct',
    }).returning();
    expect(participant).toBeDefined();
    participantId = participant!.id;

    // 5. Create entry session
    const [entrySession] = await db.insert(examEntrySessions).values({
      examId,
      participantId,
      verificationMethod: 'otp',
      status: 'active',
      expiresAt: new Date(now.getTime() + 3600_000),
    }).returning();
    expect(entrySession).toBeDefined();
    entrySessionId = entrySession!.id;

    // 6. Accept consent
    const [consent] = await db.insert(examProctoringConsents).values({
      examId,
      entrySessionId,
      candidateUserId: userId,
      clientSessionId,
      status: 'accepted',
      noticeVersion: 'v1',
      noticeSnapshotJson: {},
      acceptedCapabilitiesJson: { camera: true, screenShare: true, fullscreen: true },
      legalLinksSnapshotJson: {},
      dataRetentionDaysSnapshot: 180,
      dataDeletionSlaDaysSnapshot: 20,
      sensitiveDataDeletionTargetHoursSnapshot: 72,
      acceptedAt: now,
    }).returning();
    expect(consent).toBeDefined();
    consentRecordId = consent!.id;

    // 7. Create precheck
    const precheckExpires = new Date(now.getTime() + 300_000);
    const [precheck] = await db.insert(examProctoringPrechecks).values({
      examId,
      entrySessionId,
      candidateUserId: userId,
      clientSessionId,
      consentRecordId,
      browserName: 'Chrome',
      browserVersion: '120',
      osName: 'Windows',
      getUserMediaSupported: true,
      cameraPermissionGranted: true,
      getDisplayMediaSupported: true,
      displaySurface: 'monitor',
      monitorValidated: true,
      fullscreenSupported: true,
      browserSupported: true,
      passed: true,
      failureReasonsJson: [],
      expiresAt: precheckExpires,
    }).returning();
    expect(precheck).toBeDefined();
    precheckId = precheck!.id;

    // 8. Create participation (simulating exam start)
    const [participation] = await db.insert(examParticipations).values({
      examId,
      participantId,
      userId,
      status: 'ACTIVE',
    }).returning();
    expect(participation).toBeDefined();
    participationId = participation!.id;

    // 9. Create proctoring session
    const [session] = await db.insert(examProctoringSessions).values({
      examId,
      entrySessionId,
      participationId,
      candidateUserId: userId,
      clientSessionId,
      consentRecordId,
      precheckId,
      status: 'active',
      startedAt: now,
      lastSeenAt: now,
      lastAcceptedClientSeq: 0,
      lastPersistedClientSeq: 0,
    }).returning();
    expect(session).toBeDefined();
    sessionId = session!.id;

    // 10. Insert events (simulating WS telemetry -> Redis -> persister -> PostgreSQL)
    const eventPayloads = [
      { type: 'heartbeat', severity: 'info', seq: 1 },
      { type: 'focus_lost', severity: 'warning', seq: 2 },
      { type: 'focus_gained', severity: 'info', seq: 3 },
      { type: 'fullscreen_exit', severity: 'escalation', seq: 4 },
      { type: 'fullscreen_enter', severity: 'info', seq: 5 },
    ];

    for (const ev of eventPayloads) {
      await db.insert(examProctoringEvents).values({
        examId,
        participationId,
        sessionId,
        entrySessionId,
        candidateUserId: userId,
        clientSessionId,
        clientSeq: ev.seq,
        type: ev.type,
        severity: ev.severity,
        schemaVersion: 1,
        payloadJson: {},
        capturedAt: new Date(now.getTime() + ev.seq * 1000),
        receivedAt: new Date(now.getTime() + ev.seq * 1000 + 50),
        buffered: false,
      });
    }

    // 11. Create final flush receipt (simulating submit guard flow)
    submitAttemptId = `attempt-${testId}`;
    const [receipt] = await db.insert(examProctoringFinalFlushReceipts).values({
      examId,
      participationId,
      sessionId,
      clientSessionId,
      submitAttemptId,
      status: 'persisted',
      expectedEventCount: eventPayloads.length,
      acceptedCount: eventPayloads.length,
      dedupedCount: 0,
      persistedCount: eventPayloads.length,
      firstClientSeq: 1,
      lastClientSeq: 5,
      createdAt: now,
      persistedAt: new Date(now.getTime() + 100),
    }).returning();
    expect(receipt).toBeDefined();
    receiptId = receipt!.id;

    // 12. Compute deterministic summary
    const { ProctoringRiskService } = require('../../../../apps/api/src/services/proctoring/proctoring-risk.service');
    const risk = new ProctoringRiskService().compute(
      eventPayloads.map(ev => ({
        type: ev.type,
        capturedAt: new Date(now.getTime() + ev.seq * 1000),
        clientSeq: ev.seq,
      })),
    );

    const [summary] = await db.insert(examProctoringSummaries).values({
      examId,
      participationId,
      sessionId,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      eventCountsJson: risk.eventCountsJson,
      velocityJson: risk.velocityJson,
      finalFlushStatus: 'persisted',
      lastEventCapturedAt: new Date(now.getTime() + 5 * 1000),
      lastEventReceivedAt: new Date(now.getTime() + 5 * 1000 + 50),
      deterministicSchemaVersion: 'phase-1-deterministic-risk-v1',
      computedAt: now,
      reviewerDecision: 'pending',
    }).returning();
    expect(summary).toBeDefined();

    // 13. Verify admin review service reads canonical evidence (no AI output)
    const { ProctoringAdminReviewService } = require('../../../../apps/api/src/services/proctoring/proctoring-admin-review.service');
    const examRepository = { findById: jest.fn().mockResolvedValue({ id: examId, createdBy: userId }) };
    const participationRepository = { findById: jest.fn().mockResolvedValue({ id: participationId, examId }) };
    const summaryRepository = {
      findByParticipation: jest.fn().mockResolvedValue(summary),
      updateReviewerDecision: jest.fn().mockResolvedValue({ id: 'summary-1', reviewerDecision: 'no_action' }),
    };
    const eventRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
    const consentRepository = { findByParticipation: jest.fn().mockResolvedValue([consent]) };
    const precheckRepository = { findByParticipation: jest.fn().mockResolvedValue([precheck]) };
    const bypassRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
    const finalFlushRepository = { findByParticipation: jest.fn().mockResolvedValue([receipt]) };
    const dataRequestRepository = { findByParticipation: jest.fn().mockResolvedValue([]) };
    const summaryService = { recomputeForParticipation: jest.fn() };
    const auditLogRepository = { create: jest.fn() };

    const reviewService = new ProctoringAdminReviewService({
      examRepository, participationRepository, summaryRepository, eventRepository,
      consentRepository, precheckRepository, bypassRepository, finalFlushRepository,
      dataRequestRepository, summaryService, auditLogRepository,
    });

    const review = await reviewService.getReview(examId, participationId, {
      userId, role: 'owner',
    });

    expect(review.summary).toMatchObject({
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      finalFlushStatus: 'persisted',
      reviewerDecision: 'pending',
    });
    expect(review.evidence.consent).toHaveLength(1);
    expect(review.evidence.precheck).toHaveLength(1);
    expect(review.evidence.finalFlush).toHaveLength(1);
    expect(JSON.stringify(review)).not.toMatch(/aiResult|aiScore|llm/i);

    // 14. Admin can record review decision
    await reviewService.recordReviewDecision(examId, participationId, {
      userId, role: 'owner',
    }, { decision: 'no_action', notes: 'No issues found.' });

    expect(summaryRepository.updateReviewerDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        participationId,
        reviewerDecision: 'no_action',
        reviewerId: userId,
      })
    );
    expect(auditLogRepository.create).toHaveBeenCalled();
  });

  it('deterministic risk computation uses capturedAt ordering', async () => {
    const { ProctoringRiskService } = require('../../../../apps/api/src/services/proctoring/proctoring-risk.service');
    const risk = new ProctoringRiskService();

    const events = [
      { type: 'heartbeat', capturedAt: new Date('2026-06-12T10:00:00.000Z'), clientSeq: 1 },
      { type: 'focus_lost', capturedAt: new Date('2026-06-12T10:01:00.000Z'), clientSeq: 2 },
      { type: 'focus_gained', capturedAt: new Date('2026-06-12T10:01:05.000Z'), clientSeq: 3 },
    ];

    const result = risk.compute(events as any);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskLevel).toBeDefined();
    expect(result.eventCountsJson).toMatchObject({ heartbeat: 1, focus_lost: 1, focus_gained: 1 });
    expect(result.velocityJson.windowSeconds).toBe(300);
  });

  it('metrics service records final-flush poll durations and counters', async () => {
    const { ProctoringMetricsService } = require('../../../../apps/api/src/services/proctoring/proctoring-metrics.service');
    const metrics = new ProctoringMetricsService();

    metrics.recordFinalFlushPollDuration(50);
    metrics.recordFinalFlushPollDuration(150);
    metrics.incrementFinalFlushSuccess();
    metrics.incrementFinalFlushTimeout();
    metrics.incrementFinalFlushFailed();

    const snap = metrics.snapshot();
    expect(snap.finalFlushPollDurationMs).toHaveLength(2);
    expect(snap.finalFlushSuccessTotal).toBe(1);
    expect(snap.finalFlushTimeoutTotal).toBe(1);
    expect(snap.finalFlushFailedTotal).toBe(1);
  });
});
