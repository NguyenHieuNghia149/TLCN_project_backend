import fs from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

import {
  type BackfillReport,
  type LegacyTestcaseCandidate,
  processBackfillCandidates,
} from './backfill-testcase-json.shared';

type CandidateRow = {
  testcase_id: string;
  problem_id: string;
  function_signature: unknown;
  input_json: unknown | null;
  output_json: unknown | null;
  raw_input: string | null;
  raw_output: string | null;
};

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function parseCount(result: unknown): number {
  const rows = extractRows<{ count?: number | string }>(result);
  return Number(rows[0]?.count ?? 0);
}

/** Returns whether the legacy testcase text columns still exist in the target database. */
export async function hasLegacyTestcaseTextColumns(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'testcases'
      AND column_name IN ('input', 'output')
  `);

  return parseCount(result) === 2;
}

/** Loads testcase rows that still need JSON backfill, using legacy text columns when available. */
export async function fetchBackfillCandidates(): Promise<{
  legacyColumnsPresent: boolean;
  candidates: LegacyTestcaseCandidate[];
}> {
  const legacyColumnsPresent = await hasLegacyTestcaseTextColumns();
  const query = legacyColumnsPresent
    ? sql`
        SELECT
          t.id::text AS testcase_id,
          t.problem_id::text AS problem_id,
          p.function_signature,
          t.input_json,
          t.output_json,
          t.input AS raw_input,
          t.output AS raw_output
        FROM testcases t
        JOIN problems p ON p.id = t.problem_id
        WHERE t.input_json IS NULL OR t.output_json IS NULL
        ORDER BY t.created_at, t.id
      `
    : sql`
        SELECT
          t.id::text AS testcase_id,
          t.problem_id::text AS problem_id,
          p.function_signature,
          t.input_json,
          t.output_json,
          NULL::text AS raw_input,
          NULL::text AS raw_output
        FROM testcases t
        JOIN problems p ON p.id = t.problem_id
        WHERE t.input_json IS NULL OR t.output_json IS NULL
        ORDER BY t.created_at, t.id
      `;

  const rows = extractRows<CandidateRow>(await db.execute(query));
  return {
    legacyColumnsPresent,
    candidates: rows.map(row => ({
      testcaseId: String(row.testcase_id),
      problemId: String(row.problem_id),
      functionSignature: row.function_signature as any,
      inputJson: row.input_json,
      outputJson: row.output_json,
      rawInput: row.raw_input,
      rawOutput: row.raw_output,
    })),
  };
}

/** Applies the resolved JSON payload to a testcase row inside its own transaction. */
export async function applyBackfillCandidate(
  candidate: LegacyTestcaseCandidate,
  inputJson: Record<string, unknown>,
  outputJson: unknown,
): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE testcases
      SET
        input_json = ${JSON.stringify(inputJson)}::jsonb,
        output_json = ${JSON.stringify(outputJson)}::jsonb,
        updated_at = NOW()
      WHERE id = ${candidate.testcaseId}::uuid
    `);
  });
}

function buildReportPath(): string {
  const reportDirectory = path.resolve(__dirname, '..', '..', 'tmp', 'migrate');
  fs.mkdirSync(reportDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  return path.join(reportDirectory, `testcase-json-backfill-${timestamp}.json`);
}

/** Writes the backfill report to an ignored tmp directory and returns the file path. */
export function writeBackfillReport(report: BackfillReport, reportPath: string = buildReportPath()): string {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

/** Runs the testcase JSON backfill workflow in dry-run or apply mode. */
export async function runBackfillCommand(options: {
  dryRun: boolean;
  force: boolean;
  reportPath?: string;
}): Promise<{ report: BackfillReport; reportPath: string; exitCode: number }> {
  const { candidates, legacyColumnsPresent } = await fetchBackfillCandidates();
  const { report, exitCode } = await processBackfillCandidates(candidates, {
    dryRun: options.dryRun,
    force: options.force,
    legacyColumnsPresent,
    applyBackfill: async (candidate, decision) => {
      await applyBackfillCandidate(candidate, decision.inputJson, decision.outputJson);
    },
  });

  const reportPath = writeBackfillReport(report, options.reportPath);
  return { report, reportPath, exitCode };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  const result = await runBackfillCommand({ dryRun, force });
  console.log(
    JSON.stringify(
      {
        dryRun,
        force,
        reportPath: result.reportPath,
        report: result.report,
      },
      null,
      2,
    ),
  );

  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main()
    .catch(error => {
      logger.error('Testcase JSON backfill failed', { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await DatabaseService.disconnect();
    });
}