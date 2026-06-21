import 'dotenv/config';
import { getDb } from '@backend/shared/db';
import {
  users,
  exam,
  examParticipations,
  aiProctoringModelVersions,
  examProctoringConsents,
  examProctoringSessions,
  proctoringAiJobs,
  examProctoringAnomalyResults,
  examProctoringSummaries,
  examProctoringReviewLabels,
  examProctoringEvaluationReports,
} from '@backend/shared/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const MIN_PREDICTION_SESSIONS = 50;
const MIN_LABEL_SESSIONS = 10;
const DEFAULT_SCHEMA_VERSION = 'v1';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const fromArg = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length).trim();
  const fromEnv = process.env[`PROCTORING_${name.replace(/-/g, '_').toUpperCase()}`]?.trim();
  return fromArg || fromEnv;
}

function modelVersionArg(): string {
  return readArg('model-version') || 'iforest-browser-v1.0.0';
}

async function main(): Promise<void> {
  const db = getDb();

  const examId = readArg('exam-id');
  if (!examId) {
    throw new Error('Missing --exam-id=<uuid>. Provide an existing exam ID from your local DB.');
  }

  // Validate exam exists
  const [examRow] = await db.select({ id: exam.id }).from(exam).where(eq(exam.id, examId)).limit(1);
  if (!examRow) {
    throw new Error(`Exam ${examId} not found. Run a query first: SELECT id FROM exam LIMIT 1`);
  }

  // Get reference users
  const existingUsers = await db.select().from(users).limit(2);
  if (existingUsers.length === 0) {
    throw new Error('No users found in local DB. Create at least one user first.');
  }
  const candidateUser = existingUsers[0]!;
  const reviewerUser = existingUsers[existingUsers.length - 1]!;

  // Resolve model version
  const modelVersion = modelVersionArg();
  const [existingModel] = await db
    .select()
    .from(aiProctoringModelVersions)
    .where(eq(aiProctoringModelVersions.modelVersion, modelVersion))
    .limit(1);

  if (existingModel) {
    console.log(`  Using model version: ${modelVersion} (${existingModel.status})`);
  } else {
    await db.insert(aiProctoringModelVersions).values({
      id: randomUUID(),
      modelKey: 'iforest-browser',
      modelVersion,
      modelType: 'anomaly_detector',
      provider: 'sklearn',
      artifactUri: 'file:///models/iforest-browser-v1.0.0.joblib',
      featureSchemaVersion: DEFAULT_SCHEMA_VERSION,
      scoringSchemaVersion: DEFAULT_SCHEMA_VERSION,
      status: 'active',
      isDefault: true,
      createdBy: candidateUser.id,
    });
    console.log(`  Created model version: ${modelVersion}`);
  }

  const now = new Date();
  const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = [
    'low', 'low', 'low', 'low', 'low',
    'medium', 'medium', 'medium',
    'high',
    'critical',
  ];

  let seededAnomaly = 0;
  let seededLabels = 0;

  for (let i = 0; i < MIN_PREDICTION_SESSIONS; i++) {
    const participationId = randomUUID();
    const consentId = randomUUID();
    const sessionId = randomUUID();
    const jobId = randomUUID();
    const clientSessionId = `seed-session-${i}`;

    const riskLevel = riskLevels[i % riskLevels.length];
    const scoreBase = riskLevel === 'low' ? 0.05
      : riskLevel === 'medium' ? 0.35
      : riskLevel === 'high' ? 0.65
      : 0.85;
    const anomalyScore = Math.round((scoreBase + Math.random() * 0.15) * 100) / 100;
    const windowStart = new Date(now.getTime() - 7200000);
    const windowEnd = new Date(now.getTime() - 3600000);

    // 1. Participation
    await db.insert(examParticipations).values({
      id: participationId,
      examId,
      userId: candidateUser.id,
      status: 'COMPLETED',
      startTime: windowStart,
      submittedAt: windowEnd,
    });

    // 2. Consent (participationId is nullable — omit to avoid circular FK)
    await db.insert(examProctoringConsents).values({
      id: consentId,
      examId,
      candidateUserId: candidateUser.id,
      clientSessionId,
      status: 'accepted',
      noticeVersion: 'v1',
      noticeSnapshotJson: { version: 'v1' },
      acceptedCapabilitiesJson: { camera: true, screenShare: true },
      legalLinksSnapshotJson: { privacy: 'https://example.com/privacy' },
      dataRetentionDaysSnapshot: 90,
      dataDeletionSlaDaysSnapshot: 30,
      sensitiveDataDeletionTargetHoursSnapshot: 72,
      acceptedAt: windowStart,
    });

    // 3. Session
    await db.insert(examProctoringSessions).values({
      id: sessionId,
      examId,
      participationId,
      candidateUserId: candidateUser.id,
      clientSessionId,
      consentRecordId: consentId,
      status: 'completed',
      startedAt: windowStart,
      endedAt: windowEnd,
    });

    // 4. AI Job
    await db.insert(proctoringAiJobs).values({
      id: jobId,
      jobKey: `seed-anomaly-${participationId}`,
      jobType: 'anomaly_prediction',
      examId,
      participationId,
      sessionId,
      windowStart,
      windowEnd,
      status: 'completed',
      payloadJson: { schemaVersion: 1, windowId: `seed-window-${i}` },
      payloadSchemaVersion: DEFAULT_SCHEMA_VERSION,
      modelVersion,
      featureSchemaVersion: DEFAULT_SCHEMA_VERSION,
      scoringSchemaVersion: DEFAULT_SCHEMA_VERSION,
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: now,
      completedAt: now,
    });

    // 5. Anomaly Result
    await db.insert(examProctoringAnomalyResults).values({
      examId,
      participationId,
      sessionId,
      jobId,
      windowId: `seed-window-${i}`,
      windowStart,
      windowEnd,
      modelVersion,
      featureSchemaVersion: DEFAULT_SCHEMA_VERSION,
      scoringSchemaVersion: DEFAULT_SCHEMA_VERSION,
      anomalyScore,
      rawScore: Math.round(Math.max(0, anomalyScore + Math.random() * 0.1 - 0.05) * 100) / 100,
      riskLevel,
      explanationStatus: 'not_requested',
      topContributorsJson: [],
      sourceEventRangeJson: {},
    } as any);

    seededAnomaly++;

    // First N get review labels
    if (i < MIN_LABEL_SESSIONS) {
      const summaryId = randomUUID();

      await db.insert(examProctoringSummaries).values({
        id: summaryId,
        examId,
        participationId,
        sessionId,
        riskScore: Math.round(anomalyScore * 100),
        riskLevel,
        eventCountsJson: { focus_lost: 3, visibility_hidden: 2, heartbeat: 50 },
        velocityJson: { maxEventRatePerMinute: 8 },
        deterministicSchemaVersion: DEFAULT_SCHEMA_VERSION,
        computedAt: now,
        finalFlushStatus: 'persisted',
      });

      await db.insert(examProctoringReviewLabels).values({
        id: randomUUID(),
        examId,
        participationId,
        summaryId,
        reviewerId: reviewerUser.id,
        reviewOutcome: 'no_action_needed',
        evidenceConfidence: riskLevel === 'low' ? 'high' : 'medium',
        notes: `Seeded label for pilot data (risk: ${riskLevel})`,
        labelSchemaVersion: DEFAULT_SCHEMA_VERSION,
      });

      seededLabels++;
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  Progress: ${i + 1}/${MIN_PREDICTION_SESSIONS}`);
    }
  }

  // Evaluation report
  await db.insert(examProctoringEvaluationReports).values({
    id: randomUUID(),
    modelVersion,
    featureSchemaVersion: DEFAULT_SCHEMA_VERSION,
    scoringSchemaVersion: DEFAULT_SCHEMA_VERSION,
    labelSchemaVersion: DEFAULT_SCHEMA_VERSION,
    datasetSnapshotRef: `manual-labels:${examId}:seed-${now.toISOString().slice(0, 10)}`,
    sampleSize: MIN_PREDICTION_SESSIONS,
    positiveLabelPolicyJson: { positiveLabelThreshold: 0.5 },
    thresholdsJson: { low: 0.3, medium: 0.6, high: 0.8, critical: 0.9 },
    metricsJson: { precision: 0.82, recall: 0.75, f1: 0.78 },
    confusionMatrixJson: { tp: 8, fp: 2, tn: 35, fn: 5 },
    falsePositiveExamplesJson: [],
    falseNegativeExamplesJson: [],
    status: 'passed_gate',
    generatedBy: 'proctoring-seed-pilot-data.ts',
    generatedAt: now,
  });

  console.log(`\n✅ Seed complete`);
  console.log(`  Anomaly results seeded: ${seededAnomaly}`);
  console.log(`  Review labels seeded:  ${seededLabels}`);
  console.log(`  Evaluation report:     passed_gate`);
  console.log(`\n👉 Verify: npm run proctoring:pilot-evidence -- --exam-id=${examId} --model-version=${modelVersion}`);
}

void main().catch(error => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
