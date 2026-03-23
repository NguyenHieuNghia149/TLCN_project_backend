import fs from 'node:fs';
import path from 'node:path';

import { sql } from 'drizzle-orm';

import { db, DatabaseService } from '@backend/shared/db/connection';
import { logger } from '@backend/shared/utils';

import {
  buildFunctionSignatureManifestTemplate,
  type FunctionSignatureManifestTemplate,
  type FunctionSignatureProblemRow,
  type FunctionSignatureTestcaseRow,
} from './function-signature-migrate.shared';
import { unsupportedFunctionSignatureProblems } from './function-signature-unsupported-catalog';

/** Resolves the output path for the generated function-signature manifest template. */
export function resolveTemplateOutputPath(
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
    `function-signature-manifest-template-${timestamp}.json`,
  );
}

/** Writes the generated manifest template to disk. */
export function writeFunctionSignatureManifestTemplate(
  template: FunctionSignatureManifestTemplate,
  outputPath: string,
): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
  return outputPath;
}

/** Fetches problem rows for template generation. */
export async function fetchTemplateProblems(): Promise<FunctionSignatureProblemRow[]> {
  const result = await db.execute(sql`
    SELECT id::text AS problem_id, title, function_signature
    FROM problems
    ORDER BY created_at, id
  `);

  return (result.rows ?? []).map(row => ({
    problemId: String((row as Record<string, unknown>).problem_id),
    title: ((row as Record<string, unknown>).title ?? null) as string | null,
    functionSignature: ((row as Record<string, unknown>).function_signature ?? null) as unknown | null,
  }));
}

/** Fetches testcase rows for template generation. */
export async function fetchTemplateTestcases(): Promise<FunctionSignatureTestcaseRow[]> {
  const result = await db.execute(sql`
    SELECT id::text AS testcase_id, problem_id::text AS problem_id, input_json, output_json
    FROM testcases
    ORDER BY created_at, id
  `);

  return (result.rows ?? []).map(row => ({
    testcaseId: String((row as Record<string, unknown>).testcase_id),
    problemId: String((row as Record<string, unknown>).problem_id),
    inputJson: ((row as Record<string, unknown>).input_json ?? null) as unknown | null,
    outputJson: ((row as Record<string, unknown>).output_json ?? null) as unknown | null,
  }));
}

/** Generates the operator-owned manifest template and writes it to disk. */
export async function runFunctionSignatureTemplateGeneration(options: {
  cliPath?: string;
  now?: () => Date;
  problems?: FunctionSignatureProblemRow[];
  testcases?: FunctionSignatureTestcaseRow[];
} = {}): Promise<{ template: FunctionSignatureManifestTemplate; outputPath: string }> {
  const [problems, testcases] = await Promise.all([
    options.problems ? Promise.resolve(options.problems) : fetchTemplateProblems(),
    options.testcases ? Promise.resolve(options.testcases) : fetchTemplateTestcases(),
  ]);

  const template = buildFunctionSignatureManifestTemplate({
    problems,
    testcases,
    unsupportedProblems: unsupportedFunctionSignatureProblems,
    now: options.now,
  });
  const outputPath = resolveTemplateOutputPath(options.cliPath, options.now);
  writeFunctionSignatureManifestTemplate(template, outputPath);

  return { template, outputPath };
}

async function main(): Promise<void> {
  const result = await runFunctionSignatureTemplateGeneration({
    cliPath: process.argv[2],
  });

  console.log(
    JSON.stringify(
      {
        outputPath: result.outputPath,
        problemCount: result.template.problems.length,
        quarantinedCount: result.template.quarantined.length,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main()
    .catch(error => {
      logger.error('Function-signature manifest template generation failed', { error });
      process.exitCode = 1;
    })
    .finally(async () => {
      await DatabaseService.disconnect();
    });
}
