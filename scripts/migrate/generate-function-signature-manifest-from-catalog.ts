import fs from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

import { functionSignatureCatalog } from './function-signature-catalog';
import {
  buildFunctionSignatureManifestFromCatalog,
  type FunctionSignatureManifest,
  type FunctionSignatureProblemRow,
  type FunctionSignatureSynthesisSummary,
  type SignatureCatalogEntry,
  type UnsupportedProblemCatalogEntry,
} from './function-signature-migrate.shared';
import { unsupportedFunctionSignatureProblems } from './function-signature-unsupported-catalog';

export type FunctionSignatureSynthesisCliSummary = FunctionSignatureSynthesisSummary & {
  outputPath: string;
};

/** Resolves the output path for the synthesized executable manifest. */
export function resolveSynthesizedManifestOutputPath(
  cliPath?: string,
  now: () => Date = () => new Date(),
): string {
  if (cliPath) {
    return path.resolve(process.cwd(), cliPath);
  }

  const timestamp = now().toISOString().replace(/[.:]/g, '-');
  return path.resolve(
    process.cwd(),
    'tmp',
    'migrate',
    `function-signature-manifest-${timestamp}.json`,
  );
}

/** Writes the synthesized executable manifest to disk. */
export function writeSynthesizedFunctionSignatureManifest(
  manifest: FunctionSignatureManifest,
  outputPath: string,
): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  return outputPath;
}

/** Fetches only the problems that still need function-signature backfill. */
export async function fetchProblemsMissingFunctionSignature(): Promise<FunctionSignatureProblemRow[]> {
  const result = await db.execute(sql`
    SELECT id::text AS problem_id, title, function_signature
    FROM problems
    WHERE function_signature IS NULL
    ORDER BY created_at, id
  `);

  return (result.rows ?? []).map(row => ({
    problemId: String((row as Record<string, unknown>).problem_id),
    title: ((row as Record<string, unknown>).title ?? null) as string | null,
    functionSignature: ((row as Record<string, unknown>).function_signature ?? null) as unknown | null,
  }));
}

/** Synthesizes an executable manifest from the repo catalog plus live DB state. */
export async function runFunctionSignatureManifestSynthesis(options: {
  cliPath?: string;
  now?: () => Date;
  problems?: FunctionSignatureProblemRow[];
  catalog?: SignatureCatalogEntry[];
  unsupportedProblems?: UnsupportedProblemCatalogEntry[];
} = {}): Promise<{
  manifest: FunctionSignatureManifest;
  summary: FunctionSignatureSynthesisCliSummary;
  exitCode: number;
}> {
  const problems = options.problems
    ? options.problems
    : await fetchProblemsMissingFunctionSignature();
  const result = buildFunctionSignatureManifestFromCatalog({
    problems,
    catalog: options.catalog ?? functionSignatureCatalog,
    unsupportedProblems: options.unsupportedProblems ?? unsupportedFunctionSignatureProblems,
    now: options.now,
  });
  const outputPath = resolveSynthesizedManifestOutputPath(options.cliPath, options.now);
  writeSynthesizedFunctionSignatureManifest(result.manifest, outputPath);

  return {
    manifest: result.manifest,
    summary: {
      ...result.summary,
      outputPath,
    },
    exitCode: result.exitCode,
  };
}

async function main(): Promise<void> {
  const result = await runFunctionSignatureManifestSynthesis({
    cliPath: process.argv[2],
  });

  console.log(JSON.stringify(result.summary, null, 2));
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

if (require.main === module) {
  main()
    .catch(error => {
      logger.error('Function-signature manifest synthesis failed', { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await DatabaseService.disconnect();
    });
}
