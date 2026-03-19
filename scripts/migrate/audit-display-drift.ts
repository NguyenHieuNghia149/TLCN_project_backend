import { eq } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { problems, testcases } from '@backend/shared/db/schema';
import { FunctionSignature } from '@backend/shared/types';
import { buildTestcaseDisplay, logger } from '@backend/shared/utils';

type DriftReport = {
  checkedAt: string;
  totalRows: number;
  driftRows: number;
  problemIds: string[];
};

async function main(): Promise<void> {
  const rows = await db
    .select({
      problemId: problems.id,
      functionSignature: problems.functionSignature,
      inputJson: testcases.inputJson,
      outputJson: testcases.outputJson,
      input: testcases.input,
      output: testcases.output,
    })
    .from(testcases)
    .innerJoin(problems, eq(testcases.problemId, problems.id));

  const driftedProblemIds = new Set<string>();
  let driftRows = 0;

  for (const row of rows) {
    if (!row.functionSignature) {
      driftRows += 1;
      driftedProblemIds.add(row.problemId);
      continue;
    }

    const derived = buildTestcaseDisplay(row.functionSignature as FunctionSignature, {
      inputJson: row.inputJson as Record<string, unknown>,
      outputJson: row.outputJson,
    });

    if (derived.input !== row.input || derived.output !== row.output) {
      driftRows += 1;
      driftedProblemIds.add(row.problemId);
    }
  }

  const report: DriftReport = {
    checkedAt: new Date().toISOString(),
    totalRows: rows.length,
    driftRows,
    problemIds: Array.from(driftedProblemIds),
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.driftRows > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    logger.error('Display drift audit failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });