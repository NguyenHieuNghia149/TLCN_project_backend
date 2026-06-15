import fs from 'node:fs';
import path from 'node:path';

import * as schema from '@backend/shared/db/schema';
import { getTableName } from 'drizzle-orm';

const requiredTables = [
  ['examProctoringSettings', 'exam_proctoring_settings'],
  ['examProctoringConsents', 'exam_proctoring_consents'],
  ['examProctoringPrechecks', 'exam_proctoring_prechecks'],
  ['examProctoringBypassCodes', 'exam_proctoring_bypass_codes'],
  ['examProctoringSessions', 'exam_proctoring_sessions'],
  ['examProctoringEvents', 'exam_proctoring_events'],
  ['examProctoringFinalFlushReceipts', 'exam_proctoring_final_flush_receipts'],
  ['examProctoringSummaries', 'exam_proctoring_summaries'],
  ['proctoringAiJobs', 'proctoring_ai_jobs'],
  ['examProctoringDataRequests', 'exam_proctoring_data_requests'],
] as const;

const requiredPhase2Tables = [
  ['aiProctoringModelVersions', 'ai_proctoring_model_versions'],
  ['examProctoringAnomalyResults', 'exam_proctoring_anomaly_results'],
  ['examProctoringReviewLabels', 'exam_proctoring_review_labels'],
  ['examProctoringEvaluationReports', 'exam_proctoring_evaluation_reports'],
  ['adminAuditLogs', 'admin_audit_logs'],
] as const;

const requiredPhase3Tables = [
  ['examProctoringLlmSummaries', 'exam_proctoring_llm_summaries'],
] as const;

describe('proctoring schema exports', () => {
  it('exports every Phase 1 proctoring table from the shared schema barrel', () => {
    for (const [exportName, tableName] of requiredTables) {
      const table = (schema as Record<string, any>)[exportName];

      expect(table).toBeDefined();
      expect(getTableName(table)).toBe(tableName);
    }
  });

  it('defines event payload as jsonb and keeps dedupe participation-scoped', () => {
    const table = (schema as Record<string, any>).examProctoringEvents;

    expect(table.payloadJson.columnType).toBe('PgJsonb');
    expect(table.participationId).toBeDefined();
    expect(table.clientSessionId).toBeDefined();
    expect(table.clientSeq).toBeDefined();
  });

  it('exports Phase 2 proctoring model, anomaly, label, and evaluation tables', () => {
    for (const [exportName, tableName] of requiredPhase2Tables) {
      const table = (schema as Record<string, any>)[exportName];

      expect(table).toBeDefined();
      expect(getTableName(table)).toBe(tableName);
    }

    const anomalyResults = (schema as Record<string, any>).examProctoringAnomalyResults;
    expect(anomalyResults.windowId).toBeDefined();
    expect(anomalyResults.modelVersion).toBeDefined();
    expect(anomalyResults.featureSchemaVersion).toBeDefined();
    expect(anomalyResults.scoringSchemaVersion).toBeDefined();
    expect(anomalyResults.topContributorsJson.columnType).toBe('PgJsonb');

    const aiJobs = (schema as Record<string, any>).proctoringAiJobs;
    expect(aiJobs.jobType).toBeDefined();
    expect(aiJobs.parentJobId).toBeDefined();
    expect(aiJobs.modelVersion).toBeDefined();
    expect(aiJobs.featureSchemaVersion).toBeDefined();
    expect(aiJobs.scoringSchemaVersion).toBeDefined();

    const settings = (schema as Record<string, any>).examProctoringSettings;
    expect(settings.aiAdvisoryVisible).toBeDefined();
    expect(settings.aiMinimumEvaluationStatus).toBeDefined();
    expect(settings.defaultAnomalyModelVersion).toBeDefined();
    expect(settings.aiAnomalyThresholdsJson.columnType).toBe('PgJsonb');
    expect(settings.shapExplanationsEnabled).toBeDefined();
    expect(settings.shapMinimumRiskLevel).toBeDefined();
  });

  it('exports Phase 3 LLM summary storage without raw prompt or provider response fields', () => {
    for (const [exportName, tableName] of requiredPhase3Tables) {
      const table = (schema as Record<string, any>)[exportName];

      expect(table).toBeDefined();
      expect(getTableName(table)).toBe(tableName);
    }

    const summaries = (schema as Record<string, any>).examProctoringLlmSummaries;
    expect(summaries.provider).toBeDefined();
    expect(summaries.modelVersion).toBeDefined();
    expect(summaries.promptVersion).toBeDefined();
    expect(summaries.inputHash).toBeDefined();
    expect(summaries.validationStatus).toBeDefined();
    expect(summaries.summaryJson.columnType).toBe('PgJsonb');
    expect(summaries.riskFactsJson.columnType).toBe('PgJsonb');
    expect(summaries.sourceEventIdsJson.columnType).toBe('PgJsonb');
    expect(summaries.rawPrompt).toBeUndefined();
    expect(summaries.rawProviderResponse).toBeUndefined();

    const settings = (schema as Record<string, any>).examProctoringSettings;
    expect(settings.llmSummaryEnabled).toBeDefined();
    expect(settings.llmSummaryProvider).toBeDefined();
    expect(settings.llmSummaryModelVersion).toBeDefined();
    expect(settings.llmSummaryJudgeEnabled).toBeDefined();
    expect(settings.llmSummaryMinValidationScore).toBeDefined();
  });
});

describe('proctoring phase 1 migration', () => {
  it('partitions events by participation and does not add a full payload_json GIN index', () => {
    const migrationsDir = path.resolve(__dirname, '../../../packages/shared/db/migrations');
    const migrationName = fs
      .readdirSync(migrationsDir)
      .find(file => file.endsWith('_add_exam_proctoring_phase1.sql'));

    expect(migrationName).toBeDefined();

    const sql = fs
      .readFileSync(path.join(migrationsDir, migrationName!), 'utf8')
      .toLowerCase()
      .replace(/"/g, '');

    expect(sql).toContain('create table if not exists exam_proctoring_events');
    expect(sql).toContain('partition by hash (participation_id)');
    expect(sql).toContain('unique (participation_id, client_session_id, client_seq)');
    expect(sql).toContain('idx_exam_proctoring_events_participation_captured_at');
    expect(sql).toContain('phase 1 risk and final-submit queries are participation-scoped');
    expect(sql).toContain("status in ('active', 'healthy', 'grace_open'");
    expect(sql).not.toMatch(/using\s+gin\s*\(\s*payload_json\s*\)/);
  });
});

describe('proctoring phase 2 migration', () => {
  it('adds model registry, anomaly results, review labels, evaluation reports, and job metadata', () => {
    const migrationsDir = path.resolve(__dirname, '../../../packages/shared/db/migrations');
    const migrationName = fs
      .readdirSync(migrationsDir)
      .find(file => file.endsWith('_add_exam_proctoring_phase2.sql'));

    expect(migrationName).toBeDefined();

    const sql = fs
      .readFileSync(path.join(migrationsDir, migrationName!), 'utf8')
      .toLowerCase()
      .replace(/"/g, '');

    expect(sql).toContain('create table if not exists ai_proctoring_model_versions');
    expect(sql).toContain('create table if not exists admin_audit_logs');
    expect(sql).toContain('create unique index if not exists uq_ai_proctoring_model_versions_default');
    expect(sql).toContain('where is_default = true');
    expect(sql).toContain('create table if not exists exam_proctoring_anomaly_results');
    expect(sql).toContain('unique (participation_id, window_id, model_version)');
    expect(sql).toContain('create table if not exists exam_proctoring_review_labels');
    expect(sql).toContain('create table if not exists exam_proctoring_evaluation_reports');
    expect(sql).toContain('alter table proctoring_ai_jobs');
    expect(sql).toContain('add column if not exists job_type');
    expect(sql).toContain("job_type = 'anomaly_prediction'");
    expect(sql).toContain('add column if not exists ai_advisory_visible');
    expect(sql).toContain('add column if not exists shap_minimum_risk_level');
  });
});

describe('proctoring phase 3 migration', () => {
  it('adds LLM summary storage and job type without raw prompt/provider fields', () => {
    const migrationsDir = path.resolve(__dirname, '../../../packages/shared/db/migrations');
    const migrationName = fs
      .readdirSync(migrationsDir)
      .find(file => file.endsWith('_add_exam_proctoring_phase3.sql'));

    expect(migrationName).toBeDefined();

    const sql = fs
      .readFileSync(path.join(migrationsDir, migrationName!), 'utf8')
      .toLowerCase()
      .replace(/"/g, '');

    expect(sql).toContain('create table if not exists exam_proctoring_llm_summaries');
    expect(sql).toContain("job_type in ('anomaly_prediction', 'anomaly_explanation', 'anomaly_recompute', 'llm_summary_generation')");
    expect(sql).toContain('uq_exam_proctoring_llm_summaries_active_input');
    expect(sql).toContain('add column if not exists llm_summary_enabled');
    expect(sql).toContain('default false not null');
    expect(sql).not.toContain('raw_prompt');
    expect(sql).not.toContain('raw_provider_response');
  });
});
