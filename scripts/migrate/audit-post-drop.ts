import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

type ColumnReport = {
  checkedAt: string;
  checks: {
    testcaseInputColumnCount: number;
    testcaseOutputColumnCount: number;
    testcaseInputJsonNullCount: number;
    testcaseOutputJsonNullCount: number;
  };
};

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function countColumn(columnName: 'input' | 'output'): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'testcases' AND column_name = ${columnName}
  `);

  return Number(extractRows<{ count?: number | string }>(result)[0]?.count ?? 0);
}

async function countJsonNulls(columnName: 'input_json' | 'output_json'): Promise<number> {
  const query =
    columnName === 'input_json'
      ? sql`
          SELECT COUNT(*)::int AS count
          FROM testcases
          WHERE input_json IS NULL
        `
      : sql`
          SELECT COUNT(*)::int AS count
          FROM testcases
          WHERE output_json IS NULL
        `;

  return Number(extractRows<{ count?: number | string }>(await db.execute(query))[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const [inputColumnCount, outputColumnCount, inputJsonNullCount, outputJsonNullCount] =
    await Promise.all([
      countColumn('input'),
      countColumn('output'),
      countJsonNulls('input_json'),
      countJsonNulls('output_json'),
    ]);

  const report: ColumnReport = {
    checkedAt: new Date().toISOString(),
    checks: {
      testcaseInputColumnCount: inputColumnCount,
      testcaseOutputColumnCount: outputColumnCount,
      testcaseInputJsonNullCount: inputJsonNullCount,
      testcaseOutputJsonNullCount: outputJsonNullCount,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    inputColumnCount > 0 ||
    outputColumnCount > 0 ||
    inputJsonNullCount > 0 ||
    outputJsonNullCount > 0
  ) {
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