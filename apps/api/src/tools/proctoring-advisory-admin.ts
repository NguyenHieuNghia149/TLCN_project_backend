import axios from 'axios';
import { Client } from 'pg';

type FlagMap = Record<string, string | boolean>;

type AdvisoryStatusRow = {
  exam_id: string;
  enabled: boolean;
  ai_anomaly_enabled: boolean;
  ai_shadow_mode: boolean;
  ai_advisory_visible: boolean;
  ai_minimum_evaluation_status: string;
  default_anomaly_model_version: string | null;
};

type ModelRegistryRow = {
  model_version: string;
  model_type: string;
  status: string;
  is_default: boolean;
  activated_at: string | null;
};

type EvaluationReportRow = {
  model_version: string;
  status: string;
  generated_at: string;
};

export function parseCliArgs(argv: string[]): { command: string | null; flags: FlagMap } {
  const [, , command, ...rest] = argv;
  const flags: FlagMap = {};

  for (const token of rest) {
    if (!token.startsWith('--')) {
      continue;
    }

    const equalsIndex = token.indexOf('=');
    if (equalsIndex === -1) {
      flags[token.slice(2)] = true;
      continue;
    }

    const key = token.slice(2, equalsIndex);
    const value = token.slice(equalsIndex + 1);
    flags[key] = value;
  }

  return { command: command ?? null, flags };
}

export function requireStringFlag(flags: FlagMap, key: string): string {
  const value = flags[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing --${key}=...`);
  }
  return value.trim();
}

export function getStringFlag(flags: FlagMap, key: string, fallback: string): string {
  const value = flags[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function getNumberFlag(flags: FlagMap, key: string, fallback: number): number {
  const value = flags[key];
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${key}: ${value}`);
  }
  return parsed;
}

export function buildProbeTelemetryWindow(now: Date = new Date()): Record<string, unknown> {
  const startedAt = new Date(now.getTime() - 30_000).toISOString();
  const endedAt = now.toISOString();

  return {
    schemaVersion: 1,
    windowId: 'ops-probe-window',
    examId: 'ops-probe-exam',
    participationId: 'ops-probe-participation',
    candidateUserId: 'ops-probe-user',
    consentRecordId: 'ops-probe-consent',
    startedAt,
    endedAt,
    features: {
      windowBlurCount: 1,
      visibilityHiddenMs: 500,
      fullscreenExitCount: 0,
      screenShareStopCount: 0,
      clipboardPasteCount: 0,
      networkReconnectCount: 0,
      heartbeatGapMaxMs: 1200,
      mouseVelocityMean: 250,
      mouseVelocityStd: 60,
      keystrokeCount: 20,
      idleDurationMs: 600,
    },
    context: {},
  };
}

export function assertSingleRowUpdated(rowCount: number, examId: string): void {
  if (rowCount !== 1) {
    throw new Error(`Exam proctoring settings not found for exam ${examId}`);
  }
}

export function resolveProbeServerAiConfig(
  flags: FlagMap,
  env: NodeJS.ProcessEnv = process.env,
): { serverAiUrl: string; internalToken: string } {
  return {
    serverAiUrl: getStringFlag(flags, 'server-ai-url', env.SERVER_AI_URL ?? 'http://server-ai:8001')
      .replace(/\/+$/, ''),
    internalToken: getStringFlag(flags, 'internal-token', env.SERVER_AI_INTERNAL_TOKEN ?? ''),
  };
}

function usage(): string {
  return [
    'Usage:',
    '  node apps/api/dist/apps/api/src/tools/proctoring-advisory-admin.js status --exam-id=<uuid> [--model-version=<version>]',
    '  node apps/api/dist/apps/api/src/tools/proctoring-advisory-admin.js register-anomaly-model --model-version=<version> [--artifact-uri=<uri>] [--provider=<provider>]',
    '  node apps/api/dist/apps/api/src/tools/proctoring-advisory-admin.js seed-evaluation-report --model-version=<version> [--status=passed_gate]',
    '  node apps/api/dist/apps/api/src/tools/proctoring-advisory-admin.js enable-advisory --exam-id=<uuid> --model-version=<version>',
    '  node apps/api/dist/apps/api/src/tools/proctoring-advisory-admin.js probe-server-ai [--server-ai-url=<url>] [--internal-token=<token>]',
  ].join('\n');
}

function createDatabaseClient(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  return new Client({ connectionString });
}

async function withDatabase<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = createDatabaseClient();
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function withTransaction<T>(client: Client, work: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function commandStatus(flags: FlagMap): Promise<void> {
  const examId = requireStringFlag(flags, 'exam-id');
  const modelVersion = getStringFlag(flags, 'model-version', 'iforest-browser-v1.0.0');

  await withDatabase(async client => {
    const settings = await client.query<AdvisoryStatusRow>(
      `select exam_id, enabled, ai_anomaly_enabled, ai_shadow_mode, ai_advisory_visible,
              ai_minimum_evaluation_status, default_anomaly_model_version
         from exam_proctoring_settings
        where exam_id = $1`,
      [examId],
    );
    const models = await client.query<ModelRegistryRow>(
      `select model_version, model_type, status, is_default, activated_at
         from ai_proctoring_model_versions
        where model_type = 'anomaly_detector'
        order by activated_at desc nulls last, created_at desc`,
    );
    const reports = await client.query<EvaluationReportRow>(
      `select model_version, status, generated_at
         from exam_proctoring_evaluation_reports
        where model_version = $1
        order by generated_at desc
        limit 5`,
      [modelVersion],
    );

    console.log('Exam settings:');
    console.table(settings.rows);
    console.log('Anomaly models:');
    console.table(models.rows);
    console.log('Evaluation reports:');
    console.table(reports.rows);
  });
}

async function commandRegisterAnomalyModel(flags: FlagMap): Promise<void> {
  const modelVersion = requireStringFlag(flags, 'model-version');
  const artifactUri = getStringFlag(
    flags,
    'artifact-uri',
    `file:///models/${modelVersion}.joblib`,
  );
  const provider = getStringFlag(flags, 'provider', 'sklearn');
  const featureSchemaVersion = getStringFlag(flags, 'feature-schema-version', 'v1');
  const scoringSchemaVersion = getStringFlag(flags, 'scoring-schema-version', 'v1');
  const trainingRows = getNumberFlag(flags, 'training-rows', 0);

  await withDatabase(async client => {
    await withTransaction(client, async () => {
      await client.query(
        `insert into ai_proctoring_model_versions (
           model_key, model_version, model_type, provider, artifact_uri,
           feature_schema_version, scoring_schema_version, training_rows,
           metrics_json, thresholds_json, status, is_default, activated_at
         ) values (
           $1, $2, 'anomaly_detector', $3, $4,
           $5, $6, $7,
           $8::jsonb, $9::jsonb, 'active', true, now()
         )
         on conflict (model_version) do update
           set status = 'active',
               is_default = true,
               artifact_uri = excluded.artifact_uri,
               provider = excluded.provider,
               feature_schema_version = excluded.feature_schema_version,
               scoring_schema_version = excluded.scoring_schema_version,
               activated_at = now()`,
        [
          'iforest-browser',
          modelVersion,
          provider,
          artifactUri,
          featureSchemaVersion,
          scoringSchemaVersion,
          trainingRows,
          '{}',
          '{}',
        ],
      );
      await client.query(
        `update ai_proctoring_model_versions
            set is_default = false
          where model_type = 'anomaly_detector'
            and model_version <> $1`,
        [modelVersion],
      );
    });
  });

  console.log(`Registered anomaly model ${modelVersion}`);
}

async function commandSeedEvaluationReport(flags: FlagMap): Promise<void> {
  const modelVersion = requireStringFlag(flags, 'model-version');
  const status = getStringFlag(flags, 'status', 'passed_gate');
  const sampleSize = getNumberFlag(flags, 'sample-size', 50);
  const datasetSnapshotRef = getStringFlag(flags, 'dataset-snapshot-ref', 'manual-demo-enable');
  const generatedBy = getStringFlag(flags, 'generated-by', 'proctoring-advisory-admin');

  await withDatabase(async client => {
    await client.query(
      `insert into exam_proctoring_evaluation_reports (
         model_version, feature_schema_version, scoring_schema_version,
         label_schema_version, dataset_snapshot_ref, sample_size,
         positive_label_policy_json, thresholds_json, metrics_json, confusion_matrix_json,
         false_positive_examples_json, false_negative_examples_json,
         status, generated_by, generated_at, created_at
       ) values (
         $1, $2, $3, $4, $5, $6,
         $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
         $11::jsonb, $12::jsonb,
         $13, $14, now(), now()
       )`,
      [
        modelVersion,
        'v1',
        'v1',
        'v1',
        datasetSnapshotRef,
        sampleSize,
        '{}',
        '{}',
        '{}',
        '{}',
        '[]',
        '[]',
        status,
        generatedBy,
      ],
    );
  });

  console.log(`Seeded evaluation report for ${modelVersion} with status ${status}`);
}

async function commandEnableAdvisory(flags: FlagMap): Promise<void> {
  const examId = requireStringFlag(flags, 'exam-id');
  const modelVersion = requireStringFlag(flags, 'model-version');

  await withDatabase(async client => {
    const result = await client.query(
      `update exam_proctoring_settings
          set ai_anomaly_enabled = true,
              ai_shadow_mode = false,
              ai_advisory_visible = true,
              ai_minimum_evaluation_status = 'passed_gate',
              default_anomaly_model_version = $2,
              updated_at = now()
         where exam_id = $1`,
      [examId, modelVersion],
    );
    assertSingleRowUpdated(result.rowCount ?? 0, examId);
  });

  console.log(`Enabled advisory for exam ${examId} with model ${modelVersion}`);
}

async function commandProbeServerAi(flags: FlagMap): Promise<void> {
  const { serverAiUrl, internalToken } = resolveProbeServerAiConfig(flags);

  const response = await axios.post(
    `${serverAiUrl}/anomaly/predict`,
    buildProbeTelemetryWindow(),
    {
      headers: internalToken ? { Authorization: `Bearer ${internalToken}` } : undefined,
      timeout: 10_000,
      validateStatus: () => true,
    },
  );

  console.log(`server-ai status: ${response.status}`);
  console.log(JSON.stringify(response.data, null, 2));

  if (response.status >= 400) {
    throw new Error(`server-ai probe failed with status ${response.status}`);
  }
}

async function main(): Promise<void> {
  const { command, flags } = parseCliArgs(process.argv);

  switch (command) {
    case 'status':
      await commandStatus(flags);
      return;
    case 'register-anomaly-model':
      await commandRegisterAnomalyModel(flags);
      return;
    case 'seed-evaluation-report':
      await commandSeedEvaluationReport(flags);
      return;
    case 'enable-advisory':
      await commandEnableAdvisory(flags);
      return;
    case 'probe-server-ai':
      await commandProbeServerAi(flags);
      return;
    default:
      console.error(usage());
      process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
