import fs from 'node:fs/promises';
import path from 'node:path';

import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

import {
  buildFunctionSignatureAuditReport,
  parseFunctionSignatureManifest,
  type FunctionSignatureAuditReport,
  type FunctionSignatureManifest,
  type FunctionSignatureProblemRow,
  type FunctionSignatureTestcaseRow,
} from './function-signature-migrate.shared';

/** Resolves the optional manifest path used for audit-only DB comparison. */
export function resolveAuditManifestPath(cliPath?: string): string | null {
  if (cliPath) {
    return path.resolve(process.cwd(), cliPath);
  }

  const configured = process.env.FUNCTION_SIGNATURE_MANIFEST_PATH;
  return configured ? path.resolve(process.cwd(), configured) : null;
}

/** Loads a manifest when provided and falls back to an empty manifest when absent. */
export async function loadAuditManifest(
  manifestPath: string | null,
): Promise<FunctionSignatureManifest> {
  if (!manifestPath) {
    return { problems: [] };
  }

  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return parseFunctionSignatureManifest(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { problems: [] };
    }

    throw error;
  }
}

/** Fetches the current problem rows needed for function-signature audit reporting. */
export async function fetchFunctionSignatureProblems(): Promise<FunctionSignatureProblemRow[]> {
  const result = await db.execute(sql`
    SELECT id::text AS problem_id, title, function_signature
    FROM problems
    ORDER BY created_at, id
  `);

  return (result.rows ?? []).map(row => ({
    problemId: String((row as Record<string, unknown>).problem_id),
    title: ((row as Record<string, unknown>).title ?? null) as string | null,
    functionSignature: ((row as Record<string, unknown>).function_signature ?? null) as unknown | null,
  }));
}

/** Fetches testcase rows so the audit can flag remaining structured-json gaps. */
export async function fetchFunctionSignatureTestcases(): Promise<FunctionSignatureTestcaseRow[]> {
  const result = await db.execute(sql`
    SELECT id::text AS testcase_id, problem_id::text AS problem_id, input_json, output_json
    FROM testcases
    ORDER BY created_at, id
  `);

  return (result.rows ?? []).map(row => ({
    testcaseId: String((row as Record<string, unknown>).testcase_id),
    problemId: String((row as Record<string, unknown>).problem_id),
    inputJson: ((row as Record<string, unknown>).input_json ?? null) as unknown | null,
    outputJson: ((row as Record<string, unknown>).output_json ?? null) as unknown | null,
  }));
}

/** Runs the active function-signature audit and prints the JSON report. */
export async function runFunctionSignatureAudit(options: {
  cliPath?: string;
  now?: () => Date;
} = {}): Promise<FunctionSignatureAuditReport> {
  const manifestPath = resolveAuditManifestPath(options.cliPath);
  const [manifest, problems, testcases] = await Promise.all([
    loadAuditManifest(manifestPath),
    fetchFunctionSignatureProblems(),
    fetchFunctionSignatureTestcases(),
  ]);

  const report = buildFunctionSignatureAuditReport({
    manifest,
    manifestPath,
    problems,
    testcases,
    now: options.now,
  });

  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  runFunctionSignatureAudit({ cliPath: process.argv[2] })
    .catch(error => {
      logger.error('Function-signature audit failed', { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await DatabaseService.disconnect();
    });
}
