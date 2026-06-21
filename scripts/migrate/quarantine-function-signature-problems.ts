import { eq, inArray, sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { problems } from '@backend/shared/db/schema';
import { logger } from '@backend/shared/utils';
import { type FunctionSignature } from '@backend/shared/types';

import {
  type UnsupportedProblemCatalogEntry,
  type UnsupportedProblemReason,
} from './function-signature-migrate.shared';
import { unsupportedFunctionSignatureProblems } from './function-signature-unsupported-catalog';

export type FunctionSignatureQuarantineRow = {
  problemId: string;
  title: string | null;
  visibility: string | null;
  functionSignaturePresent: boolean;
  nullStructuredTestcaseCount: number;
};

export type FunctionSignatureQuarantineState = {
  visibility: string | null;
  functionSignaturePresent: boolean;
  nullStructuredTestcaseCount: number;
};

export type FunctionSignatureQuarantineReport = {
  checkedAt: string;
  updated: number;
  alreadyPrivate: number;
  failed: number;
  rows: Array<{
    problemId: string;
    title: string | null;
    reason: UnsupportedProblemReason;
    previousVisibility: string | null;
    nextVisibility: string | null;
    nextFunctionSignaturePresent: boolean;
    remainingNullStructuredTestcaseCount: number;
    status: 'updated' | 'already_private' | 'failed';
  }>;
};

const QUARANTINED_PROBLEM_SIGNATURE: FunctionSignature = {
  name: 'unsupportedPrivateProblem',
  args: [
    {
      name: 'rawInput',
      type: { type: 'string' },
    },
  ],
  returnType: { type: 'string' },
};

/** Fetches the current quarantine/materialization state for exact unsupported problem IDs. */
export async function fetchFunctionSignatureQuarantineRows(
  problemIds: string[],
): Promise<FunctionSignatureQuarantineRow[]> {
  if (problemIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      problemId: sql<string>`cast(${problems.id} as text)`,
      title: problems.title,
      visibility: problems.visibility,
      functionSignaturePresent: sql<boolean>`(${problems.functionSignature} IS NOT NULL)`,
      nullStructuredTestcaseCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM testcases t
        WHERE t.problem_id = ${problems.id}
          AND (t.input_json IS NULL OR t.output_json IS NULL)
      )`,
    })
    .from(problems)
    .where(inArray(problems.id, problemIds))
    .orderBy(problems.createdAt, problems.id);

  return rows.map(row => ({
    problemId: row.problemId,
    title: row.title ?? null,
    visibility: row.visibility ? String(row.visibility) : null,
    functionSignaturePresent: Boolean(row.functionSignaturePresent),
    nullStructuredTestcaseCount: Number(row.nullStructuredTestcaseCount ?? 0),
  }));
}

/** Materializes a quarantined problem into a private, schema-complete placeholder shape. */
export async function applyFunctionSignatureQuarantineState(
  problemId: string,
): Promise<FunctionSignatureQuarantineState> {
  await db
    .update(problems)
    .set({
      visibility: 'private' as any,
      functionSignature: QUARANTINED_PROBLEM_SIGNATURE as any,
      updatedAt: new Date(),
    })
    .where(eq(problems.id, problemId));

  await db.execute(sql`
      UPDATE testcases
      SET
        input_json = COALESCE(input_json, jsonb_build_object('rawInput', '')),
        output_json = COALESCE(output_json, to_jsonb(''::text)),
        updated_at = NOW()
      WHERE problem_id = ${problemId}::uuid
        AND (input_json IS NULL OR output_json IS NULL)
    `);

  const [row] = await fetchFunctionSignatureQuarantineRows([problemId]);
  return {
    visibility: row?.visibility ?? null,
    functionSignaturePresent: row?.functionSignaturePresent ?? false,
    nullStructuredTestcaseCount: row?.nullStructuredTestcaseCount ?? Number.POSITIVE_INFINITY,
  };
}

/** Applies exact-ID quarantine and reports whether every unsupported problem is now private and schema-complete. */
export async function runFunctionSignatureQuarantine(options: {
  rows?: FunctionSignatureQuarantineRow[];
  unsupportedProblems?: UnsupportedProblemCatalogEntry[];
  applyState?: (problemId: string) => Promise<FunctionSignatureQuarantineState>;
  now?: () => Date;
} = {}): Promise<{ exitCode: number; report: FunctionSignatureQuarantineReport }> {
  const unsupportedProblems = options.unsupportedProblems ?? unsupportedFunctionSignatureProblems;
  const rows = options.rows ?? (await fetchFunctionSignatureQuarantineRows(unsupportedProblems.map(problem => problem.problemId)));
  const applyState = options.applyState ?? applyFunctionSignatureQuarantineState;
  const rowsById = new Map(rows.map(row => [row.problemId, row]));
  const report: FunctionSignatureQuarantineReport = {
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    updated: 0,
    alreadyPrivate: 0,
    failed: 0,
    rows: [],
  };

  for (const unsupported of unsupportedProblems) {
    const row = rowsById.get(unsupported.problemId);
    if (!row) {
      report.failed += 1;
      report.rows.push({
        problemId: unsupported.problemId,
        title: null,
        reason: unsupported.reason,
        previousVisibility: null,
        nextVisibility: null,
        nextFunctionSignaturePresent: false,
        remainingNullStructuredTestcaseCount: Number.POSITIVE_INFINITY,
        status: 'failed',
      });
      continue;
    }

    const alreadyComplete =
      row.visibility === 'private' && row.functionSignaturePresent && row.nullStructuredTestcaseCount === 0;
    if (alreadyComplete) {
      report.alreadyPrivate += 1;
      report.rows.push({
        problemId: row.problemId,
        title: row.title,
        reason: unsupported.reason,
        previousVisibility: row.visibility,
        nextVisibility: 'private',
        nextFunctionSignaturePresent: true,
        remainingNullStructuredTestcaseCount: 0,
        status: 'already_private',
      });
      continue;
    }

    const nextState = await applyState(row.problemId);
    if (
      nextState.visibility === 'private' &&
      nextState.functionSignaturePresent &&
      nextState.nullStructuredTestcaseCount === 0
    ) {
      report.updated += 1;
      report.rows.push({
        problemId: row.problemId,
        title: row.title,
        reason: unsupported.reason,
        previousVisibility: row.visibility,
        nextVisibility: nextState.visibility,
        nextFunctionSignaturePresent: nextState.functionSignaturePresent,
        remainingNullStructuredTestcaseCount: nextState.nullStructuredTestcaseCount,
        status: 'updated',
      });
      continue;
    }

    report.failed += 1;
    report.rows.push({
      problemId: row.problemId,
      title: row.title,
      reason: unsupported.reason,
      previousVisibility: row.visibility,
      nextVisibility: nextState.visibility,
      nextFunctionSignaturePresent: nextState.functionSignaturePresent,
      remainingNullStructuredTestcaseCount: nextState.nullStructuredTestcaseCount,
      status: 'failed',
    });
  }

  return {
    exitCode: report.failed > 0 ? 1 : 0,
    report,
  };
}

if (require.main === module) {
  runFunctionSignatureQuarantine()
    .then(result => {
      console.log(JSON.stringify(result.report, null, 2));
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
      }
    })
    .catch(error => {
      logger.error('Function-signature quarantine failed', { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await DatabaseService.disconnect();
    });
}
