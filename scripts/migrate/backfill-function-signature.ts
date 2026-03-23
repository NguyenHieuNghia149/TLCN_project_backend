import fs from 'node:fs/promises';
import path from 'node:path';

import { eq, sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { problems } from '@backend/shared/db/schema';
import { FunctionSignature } from '@backend/shared/types';
import { logger } from '@backend/shared/utils';

import {
  parseFunctionSignatureManifest,
  planFunctionSignatureBackfill,
  type FunctionSignatureBackfillSummary,
  type FunctionSignatureManifest,
  type FunctionSignatureProblemRow,
  type FunctionSignatureTestcaseRow,
} from './function-signature-migrate.shared';

/** Resolves the explicit manifest path required by the active backfill command. */
export function resolveBackfillManifestPath(cliPath?: string): string {
  if (!cliPath) {
    throw new Error(
      'Function-signature backfill requires an explicit manifest path. Use `npm run migrate:function-signature:backfill -- <manifest-path>`.',
    );
  }

  return path.resolve(process.cwd(), cliPath);
}

/** Loads the manifest used by the active function-signature backfill flow. */
export async function loadBackfillManifest(manifestPath: string): Promise<FunctionSignatureManifest> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  return parseFunctionSignatureManifest(raw);
}

/** Fetches the current problem rows used by the backfill planner. */
export async function fetchBackfillProblems(): Promise<FunctionSignatureProblemRow[]> {
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

/** Fetches testcase rows so the backfill can verify signature compatibility before writing. */
export async function fetchBackfillTestcases(): Promise<FunctionSignatureTestcaseRow[]> {
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

/** Persists the canonical function signature for a single problem row. */
export async function applyProblemFunctionSignature(
  problemId: string,
  signature: FunctionSignature,
): Promise<void> {
  await db.transaction(async tx => {
    await tx
      .update(problems)
      .set({
        functionSignature: signature,
        updatedAt: new Date(),
      })
      .where(eq(problems.id, problemId));
  });
}

/** Runs the active function-signature backfill and prints the summary JSON. */
export async function runFunctionSignatureBackfill(options: {
  cliPath?: string;
  now?: () => Date;
} = {}): Promise<{ exitCode: number; summary: FunctionSignatureBackfillSummary }> {
  const manifestPath = resolveBackfillManifestPath(options.cliPath);
  const [manifest, problems, testcases] = await Promise.all([
    loadBackfillManifest(manifestPath),
    fetchBackfillProblems(),
    fetchBackfillTestcases(),
  ]);

  const planned = planFunctionSignatureBackfill({
    manifest,
    manifestPath,
    problems,
    testcases,
    now: options.now,
  });

  if (planned.exitCode === 0) {
    for (const operation of planned.operations) {
      if (operation.status === 'updated') {
        await applyProblemFunctionSignature(operation.problemId, operation.signature);
      }
    }
  }

  console.log(JSON.stringify(planned.summary, null, 2));
  return { exitCode: planned.exitCode, summary: planned.summary };
}

if (require.main === module) {
  runFunctionSignatureBackfill({ cliPath: process.argv[2] })
    .then(result => {
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
      }
    })
    .catch(error => {
      logger.error('Function-signature backfill failed', { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await DatabaseService.disconnect();
    });
}
