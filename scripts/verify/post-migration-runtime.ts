import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { DatabaseService, db } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

import {
  buildPostMigrationVerificationSummary,
  collectPostMigrationDbChecks,
  evaluatePostMigrationDbChecks,
  parseJestSummary,
  type JestResultSummary,
} from './post-migration-runtime.shared';

const smokeTestPaths = [
  'tests/unit/api/api.server.test.ts',
  'tests/unit/worker/worker.server.test.ts',
  'tests/unit/sandbox/sandbox.server.test.ts',
  'tests/unit/db/connection.test.ts',
  'apps/api/tests/integration/submission-finalization.test.ts',
] as const;

const regressionOnlyPaths = [
  'tests/unit/repositories/problem.repository.test.ts',
  'tests/unit/services/challenge.service.test.ts',
  'tests/unit/services/favorite.service.test.ts',
  'tests/unit/services/submission.service.test.ts',
  'tests/unit/worker/wrapper-generator.test.ts',
] as const;

function ensureOutputDir(): string {
  const outputDir = path.resolve(process.cwd(), 'tmp', 'verify');
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function runJestSubset(label: 'smoke' | 'regression', testPaths: readonly string[]): JestResultSummary {
  const outputDir = ensureOutputDir();
  const outputFile = path.join(outputDir, `post-migration-${label}-${Date.now()}.json`);
  const jestBin = path.resolve(process.cwd(), 'node_modules', 'jest', 'bin', 'jest.js');

  const result = spawnSync(
    process.execPath,
    [jestBin, '--runInBand', '--json', '--outputFile', outputFile, '--runTestsByPath', ...testPaths],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );

  if (!fs.existsSync(outputFile)) {
    throw new Error(`Jest did not produce the expected summary file for ${label}`);
  }

  const summary = parseJestSummary(
    readJsonFile<{
      numPassedTests?: number;
      numFailedTests?: number;
      numPendingTests?: number;
    }>(outputFile),
  );

  if ((result.status ?? 1) !== 0 || summary.failed > 0) {
    throw new Error(`${label} Jest subset failed`);
  }

  return summary;
}

async function main(): Promise<void> {
  const smokeOnly = process.argv.includes('--smoke');

  await DatabaseService.connect();
  const dbChecks = await collectPostMigrationDbChecks({ dbClient: db });
  const dbFailures = evaluatePostMigrationDbChecks(dbChecks);

  let smokeSummary: JestResultSummary = { passed: 0, failed: 0, skipped: 0 };
  let regressionSummary: JestResultSummary = { passed: 0, failed: 0, skipped: 0 };

  if (dbFailures.length === 0) {
    smokeSummary = runJestSubset('smoke', smokeTestPaths);
    if (!smokeOnly) {
      regressionSummary = runJestSubset('regression', regressionOnlyPaths);
    }
  }

  const summary = buildPostMigrationVerificationSummary({
    checkedAt: new Date().toISOString(),
    db: dbChecks,
    smoke: smokeSummary,
    regression: regressionSummary,
  });

  console.log(JSON.stringify(summary, null, 2));

  if (
    dbFailures.length > 0 ||
    smokeSummary.failed > 0 ||
    regressionSummary.failed > 0
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    logger.error('Post-migration verification failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });
