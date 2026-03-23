import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';

import { FunctionSignature } from '@backend/shared/types';
import { validateFunctionTestcaseInput, validateFunctionTestcaseOutput } from '@backend/shared/utils';

import { normalizeRuntimeSignature } from './function-signature-normalizer';

export type ManifestTestcaseEntry = {
  testcaseId: string;
  inputJson: Record<string, unknown>;
  outputJson: unknown;
};

export type ManifestProblemEntry = {
  problemId: string;
  functionSignature: unknown;
  testcases?: ManifestTestcaseEntry[];
};

export type FunctionSignatureManifest = {
  problems: ManifestProblemEntry[];
};

export type FunctionSignatureManifestTemplate = {
  generatedAt: string;
  quarantined: QuarantinedProblemSummary[];
  problems: Array<{
    problemId: string;
    title: string | null;
    functionSignature: null;
    existingFunctionSignature: unknown | null;
    testcases: Array<{
      testcaseId: string;
      inputJson: unknown | null;
      outputJson: unknown | null;
    }>;
  }>;
};

export type FunctionSignatureProblemRow = {
  problemId: string;
  title: string | null;
  functionSignature: unknown | null;
};

export type FunctionSignatureTestcaseRow = {
  testcaseId: string;
  problemId: string;
  inputJson: unknown | null;
  outputJson: unknown | null;
};

export type UnsupportedProblemReason =
  | 'oop_operations'
  | 'contest_text_input'
  | 'mislabeled_data'
  | 'mixed_output';

export type UnsupportedProblemCatalogEntry = {
  problemId: string;
  reason: UnsupportedProblemReason;
};

export type QuarantinedProblemSummary = {
  problemId: string;
  title: string | null;
  reason: UnsupportedProblemReason;
};

export type FunctionSignatureAuditReport = {
  checkedAt: string;
  manifestPath: string | null;
  problemsMissingFunctionSignature: Array<{ problemId: string; title: string | null }>;
  testcasesMissingStructuredJson: Array<{ problemId: string; testcaseId: string }>;
  problemsInManifestNotInDb: string[];
  problemsInDbMissingManifest: string[];
  quarantined: QuarantinedProblemSummary[];
  summary: {
    canBackfillNow: number;
    requiresManifestEntry: number;
    alreadyCanonical: number;
    quarantinedUnsupported: number;
  };
};

export type FunctionSignatureBackfillSummary = {
  checkedAt: string;
  manifestPath: string;
  updated: number;
  skipped: number;
  failed: number;
  warnings: number;
  missingManifestProblemIds: string[];
  problemsInManifestNotInDb: string[];
  results: Array<{
    problemId: string;
    status: 'updated' | 'skipped' | 'warning' | 'failed';
    reason?: string;
  }>;
};

type BackfillProblemOperation = {
  problemId: string;
  signature: FunctionSignature;
  status: 'updated' | 'skipped';
};

type BuildAuditOptions = {
  problems: FunctionSignatureProblemRow[];
  testcases: FunctionSignatureTestcaseRow[];
  manifest: FunctionSignatureManifest;
  manifestPath: string | null;
  unsupportedProblems: UnsupportedProblemCatalogEntry[];
  now?: () => Date;
};

type PlanBackfillOptions = {
  problems: FunctionSignatureProblemRow[];
  testcases: FunctionSignatureTestcaseRow[];
  manifest: FunctionSignatureManifest;
  manifestPath: string;
  now?: () => Date;
};

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
    testcases: z.array(manifestTestcaseSchema).optional(),
  })
  .strict();

const manifestSchema = z
  .object({
    problems: z.array(manifestProblemSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenProblems = new Set<string>();

    value.problems.forEach((problem, problemIndex) => {
      if (seenProblems.has(problem.problemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['problems', problemIndex, 'problemId'],
          message: `Duplicate manifest problemId: ${problem.problemId}`,
        });
      }

      seenProblems.add(problem.problemId);

      if (!problem.testcases) {
        return;
      }

      const seenTestcases = new Set<string>();
      problem.testcases.forEach((testcase, testcaseIndex) => {
        if (seenTestcases.has(testcase.testcaseId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['problems', problemIndex, 'testcases', testcaseIndex, 'testcaseId'],
            message: `Duplicate testcaseId for problem ${problem.problemId}: ${testcase.testcaseId}`,
          });
        }

        seenTestcases.add(testcase.testcaseId);
      });
    });
  });

/** Parses a manifest payload into the active function-signature migrate format. */
export function parseFunctionSignatureManifest(raw: string): FunctionSignatureManifest {
  return manifestSchema.parse(JSON.parse(raw));
}

/** Returns the canonical runtime shape for a manifest signature payload. */
export function getCanonicalFunctionSignature(signature: unknown): FunctionSignature {
  return normalizeRuntimeSignature(signature);
}

/** Attempts to normalize an existing DB signature without throwing on invalid stored data. */
export function tryNormalizeExistingSignature(signature: unknown | null): FunctionSignature | null {
  if (signature === null || signature === undefined) {
    return null;
  }

  try {
    return normalizeRuntimeSignature(signature);
  } catch {
    return null;
  }
}

/** Checks whether the stored DB value is already canonical and equal to the normalized signature. */
export function isCanonicalStoredSignature(signature: unknown | null): boolean {
  if (signature === null || signature === undefined) {
    return false;
  }

  const normalized = tryNormalizeExistingSignature(signature);
  return normalized !== null && isDeepStrictEqual(signature, normalized);
}

/** Builds a lookup map for exact unsupported problem IDs. */
export function buildUnsupportedProblemMap(
  unsupportedProblems: UnsupportedProblemCatalogEntry[],
): Map<string, UnsupportedProblemReason> {
  return new Map(unsupportedProblems.map(problem => [problem.problemId, problem.reason]));
}

function getProblemTestcases(
  allTestcases: FunctionSignatureTestcaseRow[],
  problemId: string,
): FunctionSignatureTestcaseRow[] {
  return allTestcases.filter(testcase => testcase.problemId === problemId);
}

/** Builds the operator-owned manifest template for problems still missing function signatures. */
export function buildFunctionSignatureManifestTemplate(options: {
  problems: FunctionSignatureProblemRow[];
  testcases: FunctionSignatureTestcaseRow[];
  unsupportedProblems: UnsupportedProblemCatalogEntry[];
  now?: () => Date;
}): FunctionSignatureManifestTemplate {
  const unsupportedMap = buildUnsupportedProblemMap(options.unsupportedProblems);
  const missingProblems = options.problems.filter(
    problem => problem.functionSignature === null || problem.functionSignature === undefined,
  );
  const quarantined = missingProblems
    .filter(problem => unsupportedMap.has(problem.problemId))
    .map(problem => ({
      problemId: problem.problemId,
      title: problem.title,
      reason: unsupportedMap.get(problem.problemId)!,
    }));
  const supportedMissingProblems = missingProblems.filter(
    problem => !unsupportedMap.has(problem.problemId),
  );

  return {
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    quarantined,
    problems: supportedMissingProblems.map(problem => ({
      problemId: problem.problemId,
      title: problem.title,
      functionSignature: null,
      existingFunctionSignature: problem.functionSignature ?? null,
      testcases: getProblemTestcases(options.testcases, problem.problemId).map(testcase => ({
        testcaseId: testcase.testcaseId,
        inputJson: testcase.inputJson,
        outputJson: testcase.outputJson,
      })),
    })),
  };
}

/** Builds the JSON audit report for the active function-signature repair flow. */
export function buildFunctionSignatureAuditReport(
  options: BuildAuditOptions,
): FunctionSignatureAuditReport {
  const unsupportedMap = buildUnsupportedProblemMap(options.unsupportedProblems);
  const manifestProblemIds = new Set(options.manifest.problems.map(problem => problem.problemId));
  const problemsMissingFunctionSignature = options.problems
    .filter(problem => problem.functionSignature === null || problem.functionSignature === undefined)
    .map(problem => ({ problemId: problem.problemId, title: problem.title }));
  const quarantined = problemsMissingFunctionSignature
    .filter(problem => unsupportedMap.has(problem.problemId))
    .map(problem => ({
      problemId: problem.problemId,
      title: problem.title,
      reason: unsupportedMap.get(problem.problemId)!,
    }));
  const supportedMissingProblems = problemsMissingFunctionSignature.filter(
    problem => !unsupportedMap.has(problem.problemId),
  );
  const testcasesMissingStructuredJson = options.testcases
    .filter(testcase => testcase.inputJson === null || testcase.outputJson === null)
    .map(testcase => ({ problemId: testcase.problemId, testcaseId: testcase.testcaseId }));
  const problemsInManifestNotInDb = options.manifest.problems
    .map(problem => problem.problemId)
    .filter(problemId => !options.problems.some(problem => problem.problemId === problemId));
  const problemsInDbMissingManifest = supportedMissingProblems
    .map(problem => problem.problemId)
    .filter(problemId => !manifestProblemIds.has(problemId));
  const alreadyCanonical = options.problems.filter(problem =>
    isCanonicalStoredSignature(problem.functionSignature),
  ).length;

  return {
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    manifestPath: options.manifestPath,
    problemsMissingFunctionSignature,
    testcasesMissingStructuredJson,
    problemsInManifestNotInDb,
    problemsInDbMissingManifest,
    quarantined,
    summary: {
      canBackfillNow: supportedMissingProblems.length - problemsInDbMissingManifest.length,
      requiresManifestEntry: problemsInDbMissingManifest.length,
      alreadyCanonical,
      quarantinedUnsupported: quarantined.length,
    },
  };
}

function validateManifestTestcases(
  signature: FunctionSignature,
  dbTestcases: FunctionSignatureTestcaseRow[],
  manifestTestcases: ManifestTestcaseEntry[] | undefined,
): string | null {
  if (!manifestTestcases || manifestTestcases.length === 0) {
    return null;
  }

  const dbTestcaseIds = new Set(dbTestcases.map(testcase => testcase.testcaseId));

  for (const testcase of manifestTestcases) {
    if (!dbTestcaseIds.has(testcase.testcaseId)) {
      return `manifest_testcase_not_found:${testcase.testcaseId}`;
    }

    const inputError = validateFunctionTestcaseInput(signature, testcase.inputJson);
    if (inputError) {
      return `invalid_manifest_testcase_input:${testcase.testcaseId}:${inputError}`;
    }

    const outputError = validateFunctionTestcaseOutput(signature, testcase.outputJson);
    if (outputError) {
      return `invalid_manifest_testcase_output:${testcase.testcaseId}:${outputError}`;
    }
  }

  return null;
}

function validateExistingStructuredTestcases(
  signature: FunctionSignature,
  dbTestcases: FunctionSignatureTestcaseRow[],
): string | null {
  for (const testcase of dbTestcases) {
    if (testcase.inputJson !== null) {
      const inputError = validateFunctionTestcaseInput(signature, testcase.inputJson);
      if (inputError) {
        return `existing_db_input_json_invalid:${testcase.testcaseId}:${inputError}`;
      }
    }

    if (testcase.outputJson !== null) {
      const outputError = validateFunctionTestcaseOutput(signature, testcase.outputJson);
      if (outputError) {
        return `existing_db_output_json_invalid:${testcase.testcaseId}:${outputError}`;
      }
    }
  }

  return null;
}

function planProblemBackfill(
  problem: FunctionSignatureProblemRow,
  dbTestcases: FunctionSignatureTestcaseRow[],
  entry: ManifestProblemEntry,
): BackfillProblemOperation {
  const signature = getCanonicalFunctionSignature(entry.functionSignature);
  const manifestValidationError = validateManifestTestcases(signature, dbTestcases, entry.testcases);

  if (manifestValidationError) {
    throw new Error(manifestValidationError);
  }

  const existingValidationError = validateExistingStructuredTestcases(signature, dbTestcases);
  if (existingValidationError) {
    throw new Error(existingValidationError);
  }

  if (isDeepStrictEqual(problem.functionSignature, signature)) {
    return {
      problemId: problem.problemId,
      signature,
      status: 'skipped',
    };
  }

  return {
    problemId: problem.problemId,
    signature,
    status: 'updated',
  };
}

/** Plans the backfill/update work and reports non-fatal warnings separately from failures. */
export function planFunctionSignatureBackfill(options: PlanBackfillOptions): {
  summary: FunctionSignatureBackfillSummary;
  operations: BackfillProblemOperation[];
  exitCode: number;
} {
  const summary: FunctionSignatureBackfillSummary = {
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    manifestPath: options.manifestPath,
    updated: 0,
    skipped: 0,
    failed: 0,
    warnings: 0,
    missingManifestProblemIds: [],
    problemsInManifestNotInDb: [],
    results: [],
  };
  const operations: BackfillProblemOperation[] = [];
  const problemsById = new Map(options.problems.map(problem => [problem.problemId, problem]));
  const manifestProblemIds = new Set(options.manifest.problems.map(problem => problem.problemId));

  for (const problem of options.problems) {
    if (
      (problem.functionSignature === null || problem.functionSignature === undefined) &&
      !manifestProblemIds.has(problem.problemId)
    ) {
      summary.warnings += 1;
      summary.missingManifestProblemIds.push(problem.problemId);
      summary.results.push({
        problemId: problem.problemId,
        status: 'warning',
        reason: 'missing_manifest_entry',
      });
    }
  }

  for (const entry of options.manifest.problems) {
    const problem = problemsById.get(entry.problemId);
    if (!problem) {
      summary.failed += 1;
      summary.problemsInManifestNotInDb.push(entry.problemId);
      summary.results.push({
        problemId: entry.problemId,
        status: 'failed',
        reason: 'problem_not_found',
      });
      continue;
    }

    try {
      const operation = planProblemBackfill(
        problem,
        getProblemTestcases(options.testcases, entry.problemId),
        entry,
      );

      if (operation.status === 'updated') {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }

      summary.results.push({
        problemId: entry.problemId,
        status: operation.status,
      });
      operations.push(operation);
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        problemId: entry.problemId,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    summary,
    operations,
    exitCode: summary.failed > 0 ? 1 : 0,
  };
}

export type SignatureCatalogEntry =
  | {
      match: { kind: 'title'; title: string };
      functionSignature: FunctionSignature;
    }
  | {
      match: { kind: 'problemId'; problemId: string };
      functionSignature: FunctionSignature;
    };

export type FunctionSignatureSynthesisSummary = {
  checkedAt: string;
  matched: Array<{ problemId: string; title: string | null }>;
  unresolved: Array<{ problemId: string; title: string | null }>;
  conflicting: Array<{ problemId: string; title: string | null; matchedEntries: number }>;
  quarantined: QuarantinedProblemSummary[];
};

function hasMissingFunctionSignature(signature: unknown | null): boolean {
  return signature === null || signature === undefined;
}

function normalizeCatalogTitle(title: string | null): string | null {
  if (typeof title !== 'string') {
    return null;
  }

  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getProblemIdMatches(
  problem: FunctionSignatureProblemRow,
  catalog: SignatureCatalogEntry[],
): SignatureCatalogEntry[] {
  return catalog.filter(
    entry => entry.match.kind === 'problemId' && entry.match.problemId === problem.problemId,
  );
}

function getTitleMatches(
  problem: FunctionSignatureProblemRow,
  catalog: SignatureCatalogEntry[],
): SignatureCatalogEntry[] {
  const normalizedTitle = normalizeCatalogTitle(problem.title);
  if (!normalizedTitle) {
    return [];
  }

  return catalog.filter(
    entry =>
      entry.match.kind === 'title' &&
      normalizeCatalogTitle(entry.match.title) === normalizedTitle,
  );
}

/** Builds an executable function-signature manifest from DB problems plus the repo catalog. */
export function buildFunctionSignatureManifestFromCatalog(options: {
  problems: FunctionSignatureProblemRow[];
  catalog: SignatureCatalogEntry[];
  unsupportedProblems: UnsupportedProblemCatalogEntry[];
  now?: () => Date;
}): {
  manifest: FunctionSignatureManifest;
  summary: FunctionSignatureSynthesisSummary;
  exitCode: number;
} {
  const unsupportedMap = buildUnsupportedProblemMap(options.unsupportedProblems);
  const summary: FunctionSignatureSynthesisSummary = {
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    matched: [],
    unresolved: [],
    conflicting: [],
    quarantined: [],
  };
  const manifest: FunctionSignatureManifest = { problems: [] };

  for (const problem of options.problems) {
    if (!hasMissingFunctionSignature(problem.functionSignature)) {
      continue;
    }

    const unsupportedReason = unsupportedMap.get(problem.problemId);
    if (unsupportedReason) {
      summary.quarantined.push({
        problemId: problem.problemId,
        title: problem.title,
        reason: unsupportedReason,
      });
      continue;
    }

    const problemIdMatches = getProblemIdMatches(problem, options.catalog);
    if (problemIdMatches.length > 1) {
      summary.conflicting.push({
        problemId: problem.problemId,
        title: problem.title,
        matchedEntries: problemIdMatches.length,
      });
      continue;
    }

    const problemIdMatch = problemIdMatches[0];
    if (problemIdMatch) {
      manifest.problems.push({
        problemId: problem.problemId,
        functionSignature: getCanonicalFunctionSignature(problemIdMatch.functionSignature),
      });
      summary.matched.push({ problemId: problem.problemId, title: problem.title });
      continue;
    }

    const titleMatches = getTitleMatches(problem, options.catalog);
    if (titleMatches.length > 1) {
      summary.conflicting.push({
        problemId: problem.problemId,
        title: problem.title,
        matchedEntries: titleMatches.length,
      });
      continue;
    }

    const titleMatch = titleMatches[0];
    if (titleMatch) {
      manifest.problems.push({
        problemId: problem.problemId,
        functionSignature: getCanonicalFunctionSignature(titleMatch.functionSignature),
      });
      summary.matched.push({ problemId: problem.problemId, title: problem.title });
      continue;
    }

    summary.unresolved.push({
      problemId: problem.problemId,
      title: problem.title,
    });
  }

  return {
    manifest,
    summary,
    exitCode: summary.unresolved.length > 0 || summary.conflicting.length > 0 ? 1 : 0,
  };
}
