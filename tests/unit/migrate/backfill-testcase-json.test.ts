import { FunctionSignature } from '@backend/shared/types';

import {
  decideBackfill,
  processBackfillCandidates,
  type LegacyTestcaseCandidate,
} from '../../../scripts/migrate/backfill-testcase-json.shared';

const twoSumSignature: FunctionSignature = {
  name: 'twoSum',
  args: [
    { name: 'nums', type: 'array', items: 'integer' },
    { name: 'target', type: 'integer' },
  ],
  returnType: { type: 'array', items: 'integer' },
};

const singleArgumentSignature: FunctionSignature = {
  name: 'isPalindrome',
  args: [{ name: 'value', type: 'string' }],
  returnType: { type: 'boolean' },
};

function buildCandidate(overrides: Partial<LegacyTestcaseCandidate> = {}): LegacyTestcaseCandidate {
  return {
    testcaseId: 'testcase-1',
    problemId: 'problem-1',
    functionSignature: twoSumSignature,
    inputJson: null,
    outputJson: null,
    rawInput: '{"nums":[2,7,11,15],"target":9}',
    rawOutput: '[0,1]',
    ...overrides,
  };
}

describe('backfill-testcase-json.shared', () => {
  it('backfills when the legacy input is a valid JSON object and output is valid JSON', () => {
    const decision = decideBackfill(buildCandidate());

    expect(decision).toEqual({
      kind: 'backfill',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
    });
  });

  it('wraps single-argument scalar input when the signature has one argument', () => {
    const decision = decideBackfill(
      buildCandidate({
        functionSignature: singleArgumentSignature,
        rawInput: '"level"',
        rawOutput: 'true',
      }),
    );

    expect(decision).toEqual({
      kind: 'backfill',
      inputJson: { value: 'level' },
      outputJson: true,
    });
  });

  it('audits when function signature is missing', () => {
    expect(decideBackfill(buildCandidate({ functionSignature: null }))).toEqual({
      kind: 'audit',
      reason: 'missing_function_signature',
    });
  });

  it('parses the exact multiline display format for testcase input', () => {
    const decision = decideBackfill(
      buildCandidate({
        rawInput: 'nums: [2, 7, 11, 15]\ntarget: 9',
        rawOutput: '[0,1]',
      }),
    );

    expect(decision).toEqual({
      kind: 'backfill',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
    });
  });

  it('audits ambiguous or invalid legacy text instead of guessing', () => {
    expect(
      decideBackfill(
        buildCandidate({
          rawInput: '2 7 11 15 9',
          rawOutput: '[0,1]',
        }),
      ),
    ).toEqual({ kind: 'audit', reason: 'input_parse_failed' });

    expect(
      decideBackfill(
        buildCandidate({
          rawInput: '{"nums":[2,7,11,15],"target":9}',
          rawOutput: 'not-json',
        }),
      ),
    ).toEqual({ kind: 'audit', reason: 'output_parse_failed' });
  });

  it('keeps dry-run exit code at 0 even when ambiguous rows are present', async () => {
    const applyBackfill = jest.fn();
    const { report, exitCode } = await processBackfillCandidates(
      [
        buildCandidate(),
        buildCandidate({ testcaseId: 'testcase-2', rawInput: 'ambiguous', rawOutput: '[0,1]' }),
      ],
      {
        dryRun: true,
        force: false,
        legacyColumnsPresent: true,
        applyBackfill,
        now: () => new Date('2026-03-22T00:00:00.000Z'),
      },
    );

    expect(exitCode).toBe(0);
    expect(applyBackfill).not.toHaveBeenCalled();
    expect(report.checkedAt).toBe('2026-03-22T00:00:00.000Z');
    expect(report.totals).toEqual({
      candidates: 2,
      backfilled: 1,
      ambiguous: 1,
      skipped: 0,
    });
  });

  it('returns a non-zero exit code in apply mode when ambiguous rows remain', async () => {
    const applyBackfill = jest.fn().mockResolvedValue(undefined);
    const { exitCode } = await processBackfillCandidates(
      [
        buildCandidate(),
        buildCandidate({ testcaseId: 'testcase-2', rawInput: 'ambiguous', rawOutput: '[0,1]' }),
      ],
      {
        dryRun: false,
        force: false,
        legacyColumnsPresent: true,
        applyBackfill,
      },
    );

    expect(exitCode).toBe(1);
    expect(applyBackfill).toHaveBeenCalledTimes(1);
  });

  it('allows force mode to return exit code 0 after backfilling deterministic rows', async () => {
    const applyBackfill = jest.fn().mockResolvedValue(undefined);
    const { exitCode } = await processBackfillCandidates(
      [
        buildCandidate(),
        buildCandidate({ testcaseId: 'testcase-2', rawInput: 'ambiguous', rawOutput: '[0,1]' }),
      ],
      {
        dryRun: false,
        force: true,
        legacyColumnsPresent: true,
        applyBackfill,
      },
    );

    expect(exitCode).toBe(0);
    expect(applyBackfill).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for rows that already have both JSON columns populated', async () => {
    const applyBackfill = jest.fn().mockResolvedValue(undefined);
    const { report } = await processBackfillCandidates(
      [
        buildCandidate({
          inputJson: { nums: [2, 7, 11, 15], target: 9 },
          outputJson: [0, 1],
        }),
      ],
      {
        dryRun: false,
        force: false,
        legacyColumnsPresent: true,
        applyBackfill,
      },
    );

    expect(applyBackfill).not.toHaveBeenCalled();
    expect(report.totals).toEqual({
      candidates: 1,
      backfilled: 0,
      ambiguous: 0,
      skipped: 1,
    });
    expect(report.rows[0]).toMatchObject({ status: 'skipped', reason: 'already_backfilled' });
  });

  it('continues after an apply failure so earlier rows stay committed and later rows still run', async () => {
    const applyBackfill = jest
      .fn<Promise<void>, [LegacyTestcaseCandidate, { kind: 'backfill'; inputJson: Record<string, unknown>; outputJson: unknown }]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const { report, exitCode } = await processBackfillCandidates(
      [
        buildCandidate({ testcaseId: 'testcase-1' }),
        buildCandidate({ testcaseId: 'testcase-2' }),
        buildCandidate({ testcaseId: 'testcase-3' }),
      ],
      {
        dryRun: false,
        force: false,
        legacyColumnsPresent: true,
        applyBackfill,
      },
    );

    expect(exitCode).toBe(1);
    expect(applyBackfill).toHaveBeenCalledTimes(3);
    expect(report.totals).toEqual({
      candidates: 3,
      backfilled: 2,
      ambiguous: 1,
      skipped: 0,
    });
    expect(report.rows[1]).toMatchObject({
      testcaseId: 'testcase-2',
      status: 'ambiguous',
      reason: 'apply_failed:boom',
    });
  });
});