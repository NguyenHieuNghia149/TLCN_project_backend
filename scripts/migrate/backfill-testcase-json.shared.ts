import { FunctionSignature } from '@backend/shared/types';
import { validateFunctionTestcaseInput, validateFunctionTestcaseOutput } from '@backend/shared/utils';

export type BackfillDecision =
  | { kind: 'backfill'; inputJson: Record<string, unknown>; outputJson: unknown }
  | { kind: 'audit'; reason: string };

export type LegacyTestcaseCandidate = {
  testcaseId: string;
  problemId: string;
  functionSignature: FunctionSignature | null;
  inputJson: unknown | null;
  outputJson: unknown | null;
  rawInput: string | null;
  rawOutput: string | null;
};

export type BackfillReportRow = {
  testcaseId: string;
  problemId: string;
  status: 'backfilled' | 'ambiguous' | 'skipped';
  reason?: string;
  rawInput?: string | null;
  rawOutput?: string | null;
};

export type BackfillReport = {
  checkedAt: string;
  legacyColumnsPresent: boolean;
  totals: {
    candidates: number;
    backfilled: number;
    ambiguous: number;
    skipped: number;
  };
  rows: BackfillReportRow[];
};

type BackfillRunOptions = {
  dryRun: boolean;
  force: boolean;
  legacyColumnsPresent: boolean;
  applyBackfill: (
    candidate: LegacyTestcaseCandidate,
    decision: Extract<BackfillDecision, { kind: 'backfill' }>
  ) => Promise<void>;
  now?: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJsonValue(rawValue: string | null): { ok: true; value: unknown } | { ok: false } {
  const normalized = normalizeText(rawValue);
  if (normalized === null) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(normalized) };
  } catch {
    return { ok: false };
  }
}

function resolveFunctionSignature(
  signature: FunctionSignature | string | null | undefined
): FunctionSignature | null {
  if (!signature) {
    return null;
  }

  if (typeof signature !== 'string') {
    return signature;
  }

  try {
    return JSON.parse(signature) as FunctionSignature;
  } catch {
    return null;
  }
}

function parseWholeObjectInput(
  signature: FunctionSignature,
  rawInput: string | null
): Record<string, unknown> | null {
  const parsed = parseJsonValue(rawInput);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return null;
  }

  return validateFunctionTestcaseInput(signature, parsed.value) === null ? parsed.value : null;
}

function parseSingleArgumentInput(
  signature: FunctionSignature,
  rawInput: string | null
): Record<string, unknown> | null {
  if (signature.args.length !== 1) {
    return null;
  }

  const parsed = parseJsonValue(rawInput);
  if (!parsed.ok) {
    return null;
  }

  const argument = signature.args[0];
  if (!argument) {
    return null;
  }

  const wrapped = { [argument.name]: parsed.value };
  return validateFunctionTestcaseInput(signature, wrapped) === null ? wrapped : null;
}

function parseDisplayFormatInput(
  signature: FunctionSignature,
  rawInput: string | null
): Record<string, unknown> | null {
  const normalized = normalizeText(rawInput);
  if (normalized === null) {
    return null;
  }

  const lines = normalized.split(/\r?\n/);
  if (lines.length !== signature.args.length) {
    return null;
  }

  const parsedInput: Record<string, unknown> = {};
  for (const [index, argument] of signature.args.entries()) {
    const line = lines[index];
    if (!line) {
      return null;
    }

    const prefix = `${argument.name}: `;
    if (!line.startsWith(prefix)) {
      return null;
    }

    const valueLiteral = line.slice(prefix.length);
    try {
      parsedInput[argument.name] = JSON.parse(valueLiteral);
    } catch {
      return null;
    }
  }

  return validateFunctionTestcaseInput(signature, parsedInput) === null ? parsedInput : null;
}

function resolveInputJson(candidate: LegacyTestcaseCandidate): BackfillDecision {
  const signature = resolveFunctionSignature(candidate.functionSignature);
  if (!signature) {
    return { kind: 'audit', reason: 'missing_function_signature' };
  }

  if (candidate.inputJson !== null) {
    if (
      validateFunctionTestcaseInput(signature, candidate.inputJson) === null &&
      isRecord(candidate.inputJson)
    ) {
      return { kind: 'backfill', inputJson: candidate.inputJson, outputJson: null };
    }

    return { kind: 'audit', reason: 'existing_input_json_invalid' };
  }

  if (candidate.rawInput === null) {
    return { kind: 'audit', reason: 'no_legacy_input_source' };
  }

  const wholeObject = parseWholeObjectInput(signature, candidate.rawInput);
  if (wholeObject) {
    return { kind: 'backfill', inputJson: wholeObject, outputJson: null };
  }

  const singleArgument = parseSingleArgumentInput(signature, candidate.rawInput);
  if (singleArgument) {
    return { kind: 'backfill', inputJson: singleArgument, outputJson: null };
  }

  const displayFormat = parseDisplayFormatInput(signature, candidate.rawInput);
  if (displayFormat) {
    return { kind: 'backfill', inputJson: displayFormat, outputJson: null };
  }

  return { kind: 'audit', reason: 'input_parse_failed' };
}

function resolveOutputJson(candidate: LegacyTestcaseCandidate): BackfillDecision {
  const signature = resolveFunctionSignature(candidate.functionSignature);
  if (!signature) {
    return { kind: 'audit', reason: 'missing_function_signature' };
  }

  if (candidate.outputJson !== null) {
    if (validateFunctionTestcaseOutput(signature, candidate.outputJson) === null) {
      return { kind: 'backfill', inputJson: {}, outputJson: candidate.outputJson };
    }

    return { kind: 'audit', reason: 'existing_output_json_invalid' };
  }

  if (candidate.rawOutput === null) {
    return { kind: 'audit', reason: 'no_legacy_output_source' };
  }

  const parsed = parseJsonValue(candidate.rawOutput);
  if (!parsed.ok) {
    return { kind: 'audit', reason: 'output_parse_failed' };
  }

  if (validateFunctionTestcaseOutput(signature, parsed.value) !== null) {
    return { kind: 'audit', reason: 'output_validation_failed' };
  }

  return { kind: 'backfill', inputJson: {}, outputJson: parsed.value };
}

/** Resolves the final JSON testcase payload or reports why the row must be audited. */
export function decideBackfill(candidate: LegacyTestcaseCandidate): BackfillDecision {
  const inputDecision = resolveInputJson(candidate);
  if (inputDecision.kind === 'audit') {
    return inputDecision;
  }

  const outputDecision = resolveOutputJson(candidate);
  if (outputDecision.kind === 'audit') {
    return outputDecision;
  }

  return {
    kind: 'backfill',
    inputJson: inputDecision.inputJson,
    outputJson: outputDecision.outputJson,
  };
}

/** Processes candidate rows and returns a report plus the exit code for the CLI wrapper. */
export async function processBackfillCandidates(
  candidates: LegacyTestcaseCandidate[],
  options: BackfillRunOptions
): Promise<{ report: BackfillReport; exitCode: number }> {
  const report: BackfillReport = {
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    legacyColumnsPresent: options.legacyColumnsPresent,
    totals: {
      candidates: candidates.length,
      backfilled: 0,
      ambiguous: 0,
      skipped: 0,
    },
    rows: [],
  };

  for (const candidate of candidates) {
    if (candidate.inputJson !== null && candidate.outputJson !== null) {
      report.totals.skipped += 1;
      report.rows.push({
        testcaseId: candidate.testcaseId,
        problemId: candidate.problemId,
        status: 'skipped',
        reason: 'already_backfilled',
        rawInput: candidate.rawInput,
        rawOutput: candidate.rawOutput,
      });
      continue;
    }

    const decision = decideBackfill(candidate);
    if (decision.kind === 'audit') {
      report.totals.ambiguous += 1;
      report.rows.push({
        testcaseId: candidate.testcaseId,
        problemId: candidate.problemId,
        status: 'ambiguous',
        reason: decision.reason,
        rawInput: candidate.rawInput,
        rawOutput: candidate.rawOutput,
      });
      continue;
    }

    if (!options.dryRun) {
      try {
        await options.applyBackfill(candidate, decision);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.totals.ambiguous += 1;
        report.rows.push({
          testcaseId: candidate.testcaseId,
          problemId: candidate.problemId,
          status: 'ambiguous',
          reason: `apply_failed:${message}`,
          rawInput: candidate.rawInput,
          rawOutput: candidate.rawOutput,
        });
        continue;
      }
    }

    report.totals.backfilled += 1;
    report.rows.push({
      testcaseId: candidate.testcaseId,
      problemId: candidate.problemId,
      status: 'backfilled',
      rawInput: candidate.rawInput,
      rawOutput: candidate.rawOutput,
    });
  }

  const exitCode =
    options.dryRun || options.force || report.totals.ambiguous === 0 ? 0 : 1;

  return { report, exitCode };
}