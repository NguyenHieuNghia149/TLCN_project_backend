import { DatabaseService, db } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

import {
  collectPostMigrationDbChecks,
  evaluatePostMigrationDbChecks,
} from '../verify/post-migration-runtime.shared';

type ColumnReport = {
  checkedAt: string;
  checks: {
    testcaseInputColumnCount: number;
    testcaseOutputColumnCount: number;
    testcaseInputJsonNullCount: number;
    testcaseOutputJsonNullCount: number;
    problemFunctionSignatureNullCount: number;
    quarantinedExpectedCount: number;
    quarantinedPrivateCount: number;
  };
};

async function main(): Promise<void> {
  const checks = await collectPostMigrationDbChecks({ dbClient: db });
  const report: ColumnReport = {
    checkedAt: new Date().toISOString(),
    checks,
  };

  console.log(JSON.stringify(report, null, 2));

  if (evaluatePostMigrationDbChecks(checks).length > 0) {
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
