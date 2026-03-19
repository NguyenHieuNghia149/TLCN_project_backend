import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { problems, testcases } from '@backend/shared/db/schema';
import { logger } from '@backend/shared/utils';

async function countJudgeModeColumns(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'problems' AND column_name = 'judge_mode'
  `);

  if (Array.isArray(result)) {
    return Number((result[0] as { count?: number } | undefined)?.count ?? 0);
  }

  return Number((result as any)?.rows?.[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const [missingFunctionSignatureRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(problems)
    .where(sql`${problems.functionSignature} IS NULL`);
  const [missingInputJsonRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(testcases)
    .where(sql`${testcases.inputJson} IS NULL`);
  const [missingOutputJsonRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(testcases)
    .where(sql`${testcases.outputJson} IS NULL`);

  const judgeModeColumnCount = await countJudgeModeColumns();

  const report = {
    checkedAt: new Date().toISOString(),
    checks: {
      problemsMissingFunctionSignature: Number(missingFunctionSignatureRow?.count ?? 0),
      testcasesMissingInputJson: Number(missingInputJsonRow?.count ?? 0),
      testcasesMissingOutputJson: Number(missingOutputJsonRow?.count ?? 0),
      judgeModeColumnCount,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const hasViolation =
    report.checks.problemsMissingFunctionSignature > 0 ||
    report.checks.testcasesMissingInputJson > 0 ||
    report.checks.testcasesMissingOutputJson > 0 ||
    report.checks.judgeModeColumnCount > 0;

  if (hasViolation) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    logger.error('Post-migration audit failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });
