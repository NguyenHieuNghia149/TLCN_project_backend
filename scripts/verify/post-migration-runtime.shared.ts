import { sql, type SQL } from 'drizzle-orm';

import { unsupportedFunctionSignatureProblems } from '../migrate/function-signature-unsupported-catalog';
import type { UnsupportedProblemCatalogEntry } from '../migrate/function-signature-migrate.shared';

export type PostMigrationDbChecks = {
  testcaseInputColumnCount: number;
  testcaseOutputColumnCount: number;
  testcaseInputJsonNullCount: number;
  testcaseOutputJsonNullCount: number;
  problemFunctionSignatureNullCount: number;
  quarantinedExpectedCount: number;
  quarantinedPrivateCount: number;
};

export type JestResultSummary = {
  passed: number;
  failed: number;
  skipped: number;
};

export type PostMigrationVerificationSummary = {
  checkedAt: string;
  db: PostMigrationDbChecks;
  smoke: JestResultSummary;
  regression: JestResultSummary;
};

type QueryableDbClient = {
  execute(query: SQL): Promise<unknown>;
};

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function countQuery(dbClient: QueryableDbClient, query: SQL): Promise<number> {
  const result = await dbClient.execute(query);
  return Number(extractRows<{ count?: number | string }>(result)[0]?.count ?? 0);
}

function buildUnsupportedProblemIdSql(unsupportedProblems: UnsupportedProblemCatalogEntry[]): SQL {
  return sql.join(
    unsupportedProblems.map(problem => sql`${problem.problemId}::uuid`),
    sql`, `,
  );
}

/** Collects the DB invariants required by the post-migration verification runner. */
export async function collectPostMigrationDbChecks(options: {
  dbClient: QueryableDbClient;
  unsupportedProblems?: UnsupportedProblemCatalogEntry[];
}): Promise<PostMigrationDbChecks> {
  const unsupportedProblems = options.unsupportedProblems ?? unsupportedFunctionSignatureProblems;
  const quarantinedExpectedCount = unsupportedProblems.length;

  const quarantinedPrivateCount =
    quarantinedExpectedCount === 0
      ? 0
      : await countQuery(
          options.dbClient,
          sql`
            SELECT COUNT(*)::int AS count
            FROM problems
            WHERE visibility = 'private'
              AND id IN (${buildUnsupportedProblemIdSql(unsupportedProblems)})
          `,
        );

  const [
    testcaseInputColumnCount,
    testcaseOutputColumnCount,
    testcaseInputJsonNullCount,
    testcaseOutputJsonNullCount,
    problemFunctionSignatureNullCount,
  ] = await Promise.all([
    countQuery(
      options.dbClient,
      sql`
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_name = 'testcases' AND column_name = 'input'
      `,
    ),
    countQuery(
      options.dbClient,
      sql`
        SELECT COUNT(*)::int AS count
        FROM information_schema.columns
        WHERE table_name = 'testcases' AND column_name = 'output'
      `,
    ),
    countQuery(
      options.dbClient,
      sql`
        SELECT COUNT(*)::int AS count
        FROM testcases
        WHERE input_json IS NULL
      `,
    ),
    countQuery(
      options.dbClient,
      sql`
        SELECT COUNT(*)::int AS count
        FROM testcases
        WHERE output_json IS NULL
      `,
    ),
    countQuery(
      options.dbClient,
      sql`
        SELECT COUNT(*)::int AS count
        FROM problems
        WHERE function_signature IS NULL
      `,
    ),
  ]);

  return {
    testcaseInputColumnCount,
    testcaseOutputColumnCount,
    testcaseInputJsonNullCount,
    testcaseOutputJsonNullCount,
    problemFunctionSignatureNullCount,
    quarantinedExpectedCount,
    quarantinedPrivateCount,
  };
}

/** Returns the invariant keys that are still failing for the current DB state. */
export function evaluatePostMigrationDbChecks(checks: PostMigrationDbChecks): string[] {
  const failures: string[] = [];

  if (checks.testcaseInputColumnCount > 0) {
    failures.push('testcaseInputColumnCount');
  }

  if (checks.testcaseOutputColumnCount > 0) {
    failures.push('testcaseOutputColumnCount');
  }

  if (checks.testcaseInputJsonNullCount > 0) {
    failures.push('testcaseInputJsonNullCount');
  }

  if (checks.testcaseOutputJsonNullCount > 0) {
    failures.push('testcaseOutputJsonNullCount');
  }

  if (checks.problemFunctionSignatureNullCount > 0) {
    failures.push('problemFunctionSignatureNullCount');
  }

  if (checks.quarantinedPrivateCount !== checks.quarantinedExpectedCount) {
    failures.push('quarantinedPrivateCount');
  }

  return failures;
}

/** Normalizes Jest's JSON output into the stable summary shape used by verification scripts. */
export function parseJestSummary(result: {
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
}): JestResultSummary {
  return {
    passed: Number(result.numPassedTests ?? 0),
    failed: Number(result.numFailedTests ?? 0),
    skipped: Number(result.numPendingTests ?? 0),
  };
}

/** Builds the final deterministic verification summary printed by the post-migration runner. */
export function buildPostMigrationVerificationSummary(
  summary: PostMigrationVerificationSummary,
): PostMigrationVerificationSummary {
  return summary;
}
