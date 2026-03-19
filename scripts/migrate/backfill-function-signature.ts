import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { problems, testcases } from '@backend/shared/db/schema';
import { EProblemJudgeMode, FunctionSignature } from '@backend/shared/types';
import {
  buildFunctionInputDisplayValue,
  canonicalizeStructuredValue,
  logger,
  normalizeRuntimeSignature,
  NormalizerError,
  validateFunctionTestcaseInput,
  validateFunctionTestcaseOutput,
} from '@backend/shared/utils';

const manifestTestcaseSchema = z
  .object({
    testcaseId: z.string().uuid(),
    inputJson: z.record(z.string(), z.unknown()),
    outputJson: z.unknown(),
  })
  .strict();

const manifestProblemSchema = z
  .object({
    problemId: z.string().uuid(),
    functionSignature: z.unknown(),
    testcases: z.array(manifestTestcaseSchema).min(1),
  })
  .strict();

const manifestSchema = z
  .object({
    problems: z.array(manifestProblemSchema).min(1),
  })
  .strict();

type Manifest = z.infer<typeof manifestSchema>;
type ManifestProblem = z.infer<typeof manifestProblemSchema>;

function resolveManifestPath(): string {
  const cliPath = process.argv[2];
  const configured = process.env.FUNCTION_SIGNATURE_MANIFEST_PATH;
  return path.resolve(
    process.cwd(),
    cliPath || configured || 'scripts/migrate/function-signature-manifest.json',
  );
}

async function loadManifest(manifestPath: string): Promise<Manifest> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  return manifestSchema.parse(JSON.parse(raw));
}

function getCanonicalSignature(signature: unknown): FunctionSignature {
  return normalizeRuntimeSignature(signature) as FunctionSignature;
}

function buildExpectedTestcaseMap(entry: ManifestProblem, signature: FunctionSignature) {
  const map = new Map(
    entry.testcases.map(testcase => {
      const inputError = validateFunctionTestcaseInput(signature, testcase.inputJson);
      if (inputError) {
        throw new Error(`Invalid testcase input for ${testcase.testcaseId}: ${inputError}`);
      }

      const outputError = validateFunctionTestcaseOutput(signature, testcase.outputJson);
      if (outputError) {
        throw new Error(`Invalid testcase output for ${testcase.testcaseId}: ${outputError}`);
      }

      return [
        testcase.testcaseId,
        {
          inputJson: testcase.inputJson,
          outputJson: testcase.outputJson,
          input: buildFunctionInputDisplayValue(signature, testcase.inputJson),
          output: canonicalizeStructuredValue(testcase.outputJson),
        },
      ] as const;
    }),
  );

  if (map.size !== entry.testcases.length) {
    throw new Error(`Manifest contains duplicate testcase IDs for problem ${entry.problemId}`);
  }

  return map;
}

async function fetchAllProblemIds(): Promise<string[]> {
  const rows = await db.select({ id: problems.id }).from(problems);
  return rows.map(row => row.id);
}

async function backfillProblem(entry: ManifestProblem): Promise<'updated' | 'skipped'> {
  const signature = getCanonicalSignature(entry.functionSignature);
  const expectedTestcases = buildExpectedTestcaseMap(entry, signature);
  let result: 'updated' | 'skipped' = 'updated';

  await db.transaction(async tx => {
    const [problemRow] = await tx
      .select({
        id: problems.id,
        title: problems.title,
        judgeMode: problems.judgeMode,
        functionSignature: problems.functionSignature,
      })
      .from(problems)
      .where(eq(problems.id, entry.problemId));

    if (!problemRow) {
      throw new Error(`Problem ${entry.problemId} not found`);
    }

    const testcaseRows = await tx
      .select({
        id: testcases.id,
        input: testcases.input,
        output: testcases.output,
        inputJson: testcases.inputJson,
        outputJson: testcases.outputJson,
      })
      .from(testcases)
      .where(eq(testcases.problemId, entry.problemId));

    if (testcaseRows.length !== expectedTestcases.size) {
      throw new Error(
        `Problem ${entry.problemId} testcase count mismatch. DB=${testcaseRows.length}, manifest=${expectedTestcases.size}`,
      );
    }

    for (const testcaseRow of testcaseRows) {
      if (!expectedTestcases.has(testcaseRow.id)) {
        throw new Error(
          `Problem ${entry.problemId} is missing manifest data for testcase ${testcaseRow.id}`,
        );
      }
    }

    const signatureAlreadyCanonical = (() => {
      try {
        return isDeepStrictEqual(getCanonicalSignature(problemRow.functionSignature), signature);
      } catch {
        return false;
      }
    })();

    const testcaseAlreadyCanonical = testcaseRows.every(testcaseRow => {
      const expected = expectedTestcases.get(testcaseRow.id);
      return (
        expected !== undefined &&
        testcaseRow.input === expected.input &&
        testcaseRow.output === expected.output &&
        isDeepStrictEqual(testcaseRow.inputJson, expected.inputJson) &&
        isDeepStrictEqual(testcaseRow.outputJson, expected.outputJson)
      );
    });

    if (
      signatureAlreadyCanonical &&
      testcaseAlreadyCanonical &&
      problemRow.judgeMode === EProblemJudgeMode.FUNCTION_SIGNATURE
    ) {
      result = 'skipped';
      return;
    }

    const now = new Date();

    await tx
      .update(problems)
      .set({
        judgeMode: EProblemJudgeMode.FUNCTION_SIGNATURE,
        functionSignature: signature,
        updatedAt: now,
      })
      .where(eq(problems.id, entry.problemId));

    for (const testcaseRow of testcaseRows) {
      const expected = expectedTestcases.get(testcaseRow.id);
      if (!expected) {
        throw new Error(`Missing manifest testcase ${testcaseRow.id}`);
      }

      await tx
        .update(testcases)
        .set({
          input: expected.input,
          output: expected.output,
          inputJson: expected.inputJson,
          outputJson: expected.outputJson,
          updatedAt: now,
        })
        .where(eq(testcases.id, testcaseRow.id));
    }
  });

  return result;
}

async function main(): Promise<void> {
  const manifestPath = resolveManifestPath();
  logger.info('Starting function-signature backfill', { manifestPath });

  const manifest = await loadManifest(manifestPath);
  const existingProblemIds = await fetchAllProblemIds();
  const manifestProblemIds = new Set(manifest.problems.map(problem => problem.problemId));
  const missingManifestProblemIds = existingProblemIds.filter(id => !manifestProblemIds.has(id));

  const summary = {
    manifestPath,
    updated: 0,
    skipped: 0,
    failed: 0,
    missingManifestProblemIds,
  };

  if (missingManifestProblemIds.length > 0) {
    logger.error('Backfill manifest is missing problems', { missingManifestProblemIds });
    summary.failed += missingManifestProblemIds.length;
  }

  for (const entry of manifest.problems) {
    try {
      const outcome = await backfillProblem(entry);
      summary[outcome] += 1;
      logger.info(`Backfill ${outcome} problem ${entry.problemId}`);
    } catch (error) {
      summary.failed += 1;

      if (error instanceof NormalizerError) {
        logger.error('Function-signature backfill failed during normalization', {
          problemId: entry.problemId,
          code: error.code,
          message: error.message,
        });
        continue;
      }

      logger.error('Function-signature backfill failed for problem', {
        problemId: entry.problemId,
        error,
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch(error => {
    logger.error('Backfill script crashed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await DatabaseService.disconnect();
  });
