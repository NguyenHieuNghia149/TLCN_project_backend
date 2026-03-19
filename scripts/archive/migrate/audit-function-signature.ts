import fs from 'node:fs/promises';
import path from 'node:path';

import { isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { problems, testcases } from '@backend/shared/db/schema';
import { logger } from '@backend/shared/utils';

const manifestSchema = z
  .object({
    problems: z.array(
      z.object({
        problemId: z.string().uuid(),
      })
    ),
  })
  .strict();

function resolveManifestPath(): string {
  const cliPath = process.argv[2];
  const configured = process.env.FUNCTION_SIGNATURE_MANIFEST_PATH;
  return path.resolve(
    process.cwd(),
    cliPath || configured || 'scripts/archive/migrate/function-signature-manifest.json'
  );
}

async function loadManifestIds(manifestPath: string): Promise<Set<string>> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(raw));
  return new Set(manifest.problems.map(problem => problem.problemId));
}

async function main(): Promise<void> {
  const manifestPath = resolveManifestPath();
  const manifestProblemIds = await loadManifestIds(manifestPath);

  const [missingFunctionSignatureRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(problems)
    .where(isNull(problems.functionSignature));
  const [missingStructuredTestcasesRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(testcases)
    .where(or(isNull(testcases.inputJson), isNull(testcases.outputJson)));

  const problemRows = await db.select({ id: problems.id }).from(problems);
  const missingManifestProblemIds = problemRows
    .map(problem => problem.id)
    .filter(problemId => !manifestProblemIds.has(problemId));
  const extraManifestProblemIds = [...manifestProblemIds].filter(
    problemId => !problemRows.some(problem => problem.id === problemId)
  );

  const report = {
    checkedAt: new Date().toISOString(),
    manifestPath,
    checks: {
      problemsMissingFunctionSignature: Number(missingFunctionSignatureRow?.count ?? 0),
      testcasesMissingStructuredJson: Number(missingStructuredTestcasesRow?.count ?? 0),
      problemsMissingManifest: missingManifestProblemIds.length,
      extraManifestProblemIds,
    },
    details: {
      missingManifestProblemIds,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const hasViolation =
    report.checks.problemsMissingFunctionSignature > 0 ||
    report.checks.testcasesMissingStructuredJson > 0 ||
    report.checks.problemsMissingManifest > 0 ||
    report.checks.extraManifestProblemIds.length > 0;

  if (hasViolation) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    logger.error('Archived migration audit failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });
