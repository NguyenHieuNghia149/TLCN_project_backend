import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

type ColumnReport = {
  checkedAt: string;
  checks: {
    testcaseInputColumnCount: number;
    testcaseOutputColumnCount: number;
  };
};

async function countColumn(columnName: 'input' | 'output'): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'testcases' AND column_name = ${columnName}
  `);

  if (Array.isArray(result)) {
    return Number((result[0] as { count?: number } | undefined)?.count ?? 0);
  }

  return Number((result as any)?.rows?.[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const [inputColumnCount, outputColumnCount] = await Promise.all([
    countColumn('input'),
    countColumn('output'),
  ]);

  const report: ColumnReport = {
    checkedAt: new Date().toISOString(),
    checks: {
      testcaseInputColumnCount: inputColumnCount,
      testcaseOutputColumnCount: outputColumnCount,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (inputColumnCount > 0 || outputColumnCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    logger.error('Post-drop audit failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });