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
    expect(sql).not.toMatch(/using\s+gin\s*\(\s*payload_json\s*\)/);
  });
});
