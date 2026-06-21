import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { ProctoringAdminReviewService } from '../../../../apps/api/src/services/proctoring/proctoring-admin-review.service';
import { ProctoringAiJobService } from '../../../../apps/api/src/services/proctoring/proctoring-ai-job.service';
import { ProctoringEvaluationService } from '../../../../apps/api/src/services/proctoring/proctoring-evaluation.service';
import { ProctoringAiWorkerService } from '../../../../apps/worker/src/services/proctoring-ai-worker.service';
import { DatabaseService, db } from '../../../../packages/shared/db/connection';
import {
  exam,
  examEntrySessions,
  examParticipants,
  examParticipations,
  examProctoringAnomalyResults,
  examProctoringConsents,
  examProctoringEvaluationReports,
  examProctoringEvents,
  examProctoringLlmSummaries,
  examProctoringReviewLabels,
  examProctoringSessions,
  examProctoringSettings,
  examProctoringSummaries,
  proctoringAiJobs,
  users,
} from '../../../../packages/shared/db/schema';

const describeDbIntegration =
  process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

async function createCoreRows() {
  const testId = crypto.randomUUID().slice(0, 8);
  const now = new Date('2026-06-14T10:00:00.000Z');
  const clientSessionId = `client-${testId}`;
  const [teacher] = await db
    .insert(users)
    .values({
      email: `phase3-prepilot-${testId}@example.com`,
      password: 'Password1!',
      firstName: 'Phase3',
      lastName: 'Prepilot',
      role: 'teacher',
    })
    .returning();
  const [examRow] = await db
    .insert(exam)
    .values({
      title: `Phase 3 Prepilot ${testId}`,
      slug: `phase3-prepilot-${testId}`,
      createdBy: teacher!.id,
      duration: 60,
      startDate: now,
      endDate: new Date(now.getTime() + 3600_000),
      maxAttempts: 1,
    })
    .returning();
  const [participant] = await db
    .insert(examParticipants)
    .values({
      examId: examRow!.id,
      userId: teacher!.id,
      normalizedEmail: `phase3-prepilot-${testId}@example.com`,
      fullName: 'Phase3 Prepilot',
      source: 'direct',
      approvalStatus: 'approved',
    })
    .returning();
  const [participation] = await db
    .insert(examParticipations)
    .values({
      examId: examRow!.id,
      participantId: participant!.id,
      userId: teacher!.id,
      status: 'ACTIVE',
    })
    .returning();
  const [entrySession] = await db
    .insert(examEntrySessions)
    .values({
      examId: examRow!.id,
      participantId: participant!.id,
      participationId: participation!.id,
      verificationMethod: 'otp',
      status: 'active',
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
    })
    .returning();
  await db.insert(examProctoringSettings).values({
    examId: examRow!.id,
    enabled: true,
    requireCamera: true,
    requireScreenShare: true,
    requireFullscreen: true,
    requireMonitorDisplaySurface: false,
    allowedEventTypesJson: ['heartbeat', 'focus_lost'],
    riskWeightsJson: {},
    riskThresholdsJson: {},
    clipboardPolicy: 'log_only',
    aiAnomalyEnabled: true,
    aiShadowMode: true,
    aiAdvisoryVisible: false,
    aiMinimumEvaluationStatus: 'passed_gate',
    aiAnomalyThresholdsJson: {},
    shapExplanationsEnabled: true,
    shapMinimumRiskLevel: 'high',
    llmSummaryEnabled: false,
    llmSummaryProvider: null,
    llmSummaryModelVersion: null,
    llmSummaryPromptVersion: 'proctoring-summary-v1',
    llmSummaryJudgeEnabled: true,
    llmSummaryMinValidationScore: '0.85',
    llmSummaryRateLimitPerParticipation: 3,
    llmSummaryRateLimitWindowHours: 24,
    aiJobWindowSeconds: 300,
    consentNoticeVersion: 'v1',
    legalLinksJson: {},
    dataRetentionDays: 180,
    dataDeletionSlaDays: 20,
    sensitiveDataDeletionTargetHours: 72,
  });
  const [consent] = await db
    .insert(examProctoringConsents)
    .values({
      examId: examRow!.id,
      entrySessionId: entrySession!.id,
      participationId: participation!.id,
      candidateUserId: teacher!.id,
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
    })
    .returning();
  const [session] = await db
    .insert(examProctoringSessions)
    .values({
      examId: examRow!.id,
      entrySessionId: entrySession!.id,
      participationId: participation!.id,
      candidateUserId: teacher!.id,
      clientSessionId,
      consentRecordId: consent!.id,
      status: 'active',
      startedAt: now,
      lastSeenAt: now,
      lastAcceptedClientSeq: 0,
      lastPersistedClientSeq: 0,
    })
    .returning();
  const [summary] = await db
    .insert(examProctoringSummaries)
    .values({
      examId: examRow!.id,
      participationId: participation!.id,
      riskScore: 10,
      riskLevel: 'low',
      eventCountsJson: { heartbeat: 1 },
      velocityJson: { windowSeconds: 300 },
      finalFlushStatus: 'persisted',
      deterministicSchemaVersion: 'phase-1-deterministic-risk-v1',
      computedAt: now,
      reviewerDecision: 'pending',
    })
    .returning();

  return {
    now,
    teacherId: teacher!.id,
    examId: examRow!.id,
    participationId: participation!.id,
    entrySessionId: entrySession!.id,
    clientSessionId,
    sessionId: session!.id,
    deterministicSummaryId: summary!.id,
  };
}

async function cleanupExam(examId: string, userId: string) {
  await db.delete(examProctoringEvaluationReports).where(eq(examProctoringEvaluationReports.generatedBy, userId)).catch(() => {});
  await db.delete(examProctoringReviewLabels).where(eq(examProctoringReviewLabels.examId, examId)).catch(() => {});
  await db.delete(examProctoringLlmSummaries).where(eq(examProctoringLlmSummaries.examId, examId)).catch(() => {});
  await db.delete(examProctoringAnomalyResults).where(eq(examProctoringAnomalyResults.examId, examId)).catch(() => {});
  await db.delete(proctoringAiJobs).where(eq(proctoringAiJobs.examId, examId)).catch(() => {});
  await db.delete(examProctoringSummaries).where(eq(examProctoringSummaries.examId, examId)).catch(() => {});
  await db.delete(examProctoringEvents).where(eq(examProctoringEvents.examId, examId)).catch(() => {});
  await db.delete(examProctoringSessions).where(eq(examProctoringSessions.examId, examId)).catch(() => {});
  await db.delete(examProctoringConsents).where(eq(examProctoringConsents.examId, examId)).catch(() => {});
  await db.delete(examProctoringSettings).where(eq(examProctoringSettings.examId, examId)).catch(() => {});
  await db.delete(examEntrySessions).where(eq(examEntrySessions.examId, examId)).catch(() => {});
  await db.delete(examParticipations).where(eq(examParticipations.examId, examId)).catch(() => {});
  await db.delete(examParticipants).where(eq(examParticipants.examId, examId)).catch(() => {});
  await db.delete(exam).where(eq(exam.id, examId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
}

describeDbIntegration('Phase 3 pre-pilot live-stack gate', () => {
  beforeAll(async () => {
    await DatabaseService.connect();
  });

  afterAll(async () => {
    await DatabaseService.disconnect();
  });

  it('dead-letters exhausted LLM summary jobs and updates the summary row safely', async () => {
    const core = await createCoreRows();
    try {
      const [llmSummary] = await db
        .insert(examProctoringLlmSummaries)
        .values({
          examId: core.examId,
          participationId: core.participationId,
          deterministicSummaryId: core.deterministicSummaryId,
          provider: 'disabled',
          modelVersion: 'summary-disabled-v1',
          promptVersion: 'proctoring-summary-v1',
          inputSchemaVersion: 'proctoring-summary-input-v1',
          outputSchemaVersion: 'proctoring-summary-output-v1',
          inputHash: 'a'.repeat(64),
          status: 'pending',
          validationStatus: 'not_run',
          validationErrorsJson: [],
          sourceEventIdsJson: [],
          requestedBy: core.teacherId,
        } as any)
        .returning();
      const [job] = await db
        .insert(proctoringAiJobs)
        .values({
          jobKey: `prepilot-summary:${core.participationId}:${llmSummary!.id}`,
          jobType: 'llm_summary_generation',
          examId: core.examId,
          participationId: core.participationId,
          sessionId: null,
          windowStart: core.now,
          windowEnd: core.now,
          status: 'pending',
          priority: 15,
          payloadJson: {
            schemaVersion: 'proctoring-summary-input-v1',
            examId: core.examId,
            participationId: core.participationId,
            llmSummaryId: llmSummary!.id,
            inputHash: 'a'.repeat(64),
            timeline: [],
            riskFacts: [],
            anomalyFacts: [],
            reviewFacts: {},
            missingDataNotes: [],
          },
          payloadSchemaVersion: 'proctoring-summary-input-v1',
          modelVersion: 'summary-disabled-v1',
          featureSchemaVersion: 'proctoring-summary-input-v1',
          scoringSchemaVersion: 'proctoring-summary-output-v1',
          attempts: 2,
          maxAttempts: 3,
          nextRunAt: core.now,
        } as any)
        .returning();

      const worker = new ProctoringAiWorkerService({
        httpClient: {
          predict: jest.fn(),
          explain: jest.fn(),
          generateSummary: jest
            .fn()
            .mockRejectedValue(new Error('provider unavailable: raw response secret')),
        } as any,
        workerId: 'phase3-prepilot-worker',
        now: () => core.now,
      });

      await expect(worker.processNext()).resolves.toEqual({
        status: 'dead_letter',
        jobId: job!.id,
      });

      const [updatedSummary] = await db
        .select()
        .from(examProctoringLlmSummaries)
        .where(eq(examProctoringLlmSummaries.id, llmSummary!.id));
      const [updatedJob] = await db
        .select()
        .from(proctoringAiJobs)
        .where(eq(proctoringAiJobs.id, job!.id));

      expect(updatedSummary).toMatchObject({
        status: 'dead_letter',
        validationStatus: 'failed',
        validationErrorsJson: ['provider_failed'],
        summaryJson: null,
        riskFactsJson: null,
      });
      expect(updatedJob).toMatchObject({
        status: 'dead_letter',
        lastError: 'summary_generation_dead_letter',
      });
      expect(JSON.stringify({ updatedSummary, updatedJob })).not.toMatch(
        /raw response secret|raw_provider_response|rawPrompt/i
      );
    } finally {
      await cleanupExam(core.examId, core.teacherId);
    }
  });

  it('keeps LLM summary content hidden from admin review while summary visibility is disabled', async () => {
    const core = await createCoreRows();
    try {
      await db.insert(examProctoringLlmSummaries).values({
        examId: core.examId,
        participationId: core.participationId,
        deterministicSummaryId: core.deterministicSummaryId,
        provider: 'disabled',
        modelVersion: 'summary-disabled-v1',
        promptVersion: 'proctoring-summary-v1',
        inputSchemaVersion: 'proctoring-summary-input-v1',
        outputSchemaVersion: 'proctoring-summary-output-v1',
        inputHash: 'b'.repeat(64),
        status: 'accepted',
        validationStatus: 'passed',
        validationScore: '0.95',
        validationErrorsJson: [],
        summaryJson: { summaryText: 'This accepted summary must stay hidden.' },
        riskFactsJson: [],
        missingDataNotesJson: [],
        modelNotesJson: [],
        sourceEventIdsJson: [],
        requestedBy: core.teacherId,
        completedAt: core.now,
      } as any);

      const review = await new ProctoringAdminReviewService().getReview(
        core.examId,
        core.participationId,
        { userId: core.teacherId, role: 'teacher' }
      );

      expect(review.aiAdvisory).toEqual({
        visible: false,
        status: 'hidden_shadow_mode',
        windows: [],
      });
      expect((review as any).llmSummary).toBeUndefined();
      expect(JSON.stringify(review)).not.toMatch(/accepted summary must stay hidden/i);
    } finally {
      await cleanupExam(core.examId, core.teacherId);
    }
  });

  it('runs a small internal Phase 2 path from telemetry through AI result and evaluation report', async () => {
    const core = await createCoreRows();
    try {
      const [event] = await db
        .insert(examProctoringEvents)
        .values({
          examId: core.examId,
          participationId: core.participationId,
          sessionId: core.sessionId,
          entrySessionId: core.entrySessionId,
          candidateUserId: core.teacherId,
          clientSessionId: core.clientSessionId,
          clientSeq: 1,
          type: 'focus_lost',
          severity: 'warning',
          schemaVersion: 1,
          payloadJson: { eventName: 'focus_lost' },
          capturedAt: new Date(core.now.getTime() + 1000),
          receivedAt: new Date(core.now.getTime() + 1100),
          buffered: false,
        })
        .returning();

      const aiJob = await new ProctoringAiJobService({
        globalAiEnabled: true,
        globalShadowMode: true,
      }).enqueueTelemetryWindow({
        events: [event!] as any,
        modelVersion: 'iforest-prepilot-v1',
        now: new Date(core.now.getTime() + 2000),
      });

      expect(aiJob).toMatchObject({
        jobType: 'anomaly_prediction',
        status: 'pending',
        modelVersion: 'iforest-prepilot-v1',
      });
      expect(JSON.stringify(aiJob!.payloadJson)).not.toMatch(/payloadJson|sourceCode|rawClipboard/i);

      const worker = new ProctoringAiWorkerService({
        httpClient: {
          predict: jest.fn().mockResolvedValue({
            windowId: aiJob!.payloadJson.windowId,
            examId: core.examId,
            participationId: core.participationId,
            modelVersion: 'iforest-prepilot-v1',
            anomalyScore: 0.2,
            rawScore: 0.2,
            riskLevel: 'low',
            explanationStatus: 'not_requested',
            topContributors: [],
          }),
          explain: jest.fn(),
          generateSummary: jest.fn(),
        } as any,
        workerId: 'phase2-prepilot-worker',
        now: () => new Date(core.now.getTime() + 3000),
      });

      await expect(worker.processNext()).resolves.toEqual({
        status: 'completed',
        jobId: aiJob!.id,
      });

      await new ProctoringAdminReviewService().recordReviewLabel(
        core.examId,
        core.participationId,
        { userId: core.teacherId, role: 'teacher' },
        {
          reviewOutcome: 'no_action_needed',
          evidenceConfidence: 'high',
          notes: 'Internal pre-pilot label.',
        }
      );

      const report = await new ProctoringEvaluationService().generateReport({
        examId: core.examId,
        modelVersion: 'iforest-prepilot-v1',
        featureSchemaVersion: 'browser-window-v1',
        scoringSchemaVersion: 'anomaly-score-v1',
        datasetSnapshotRef: `internal-prepilot:${core.examId}`,
        thresholds: { high: 0.7, critical: 0.9 },
        generatedBy: core.teacherId,
      });

      expect(report).toMatchObject({
        modelVersion: 'iforest-prepilot-v1',
        sampleSize: 1,
        status: 'insufficient_sample',
        confusionMatrixJson: {
          truePositive: 0,
          falsePositive: 0,
          trueNegative: 1,
          falseNegative: 0,
        },
      });
      expect(JSON.stringify(report)).not.toMatch(/payloadJson|rawClipboard|sourceCode/i);
    } finally {
      await cleanupExam(core.examId, core.teacherId);
    }
  });
});
