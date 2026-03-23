import {
  runFunctionSignatureQuarantine,
  type FunctionSignatureQuarantineRow,
  type FunctionSignatureQuarantineState,
} from '../../../scripts/migrate/quarantine-function-signature-problems';
import { type UnsupportedProblemCatalogEntry } from '../../../scripts/migrate/function-signature-migrate.shared';

function buildRow(
  overrides: Partial<FunctionSignatureQuarantineRow> = {},
): FunctionSignatureQuarantineRow {
  return {
    problemId: '00000000-0000-0000-0000-000000000000',
    title: 'Design HashMap',
    visibility: 'public',
    functionSignaturePresent: false,
    nullStructuredTestcaseCount: 2,
    ...overrides,
  };
}

function buildState(
  overrides: Partial<FunctionSignatureQuarantineState> = {},
): FunctionSignatureQuarantineState {
  return {
    visibility: 'private',
    functionSignaturePresent: true,
    nullStructuredTestcaseCount: 0,
    ...overrides,
  };
}

describe('function-signature quarantine', () => {
  it('materializes unsupported rows into private schema-complete placeholders', async () => {
    const unsupportedProblems: UnsupportedProblemCatalogEntry[] = [
      { problemId: '00000000-0000-0000-0000-000000000000', reason: 'oop_operations' },
    ];
    const applyState = jest.fn().mockResolvedValue(buildState());

    const result = await runFunctionSignatureQuarantine({
      rows: [buildRow()],
      unsupportedProblems,
      applyState,
      now: () => new Date('2026-03-23T12:00:00.000Z'),
    });

    expect(result.exitCode).toBe(0);
    expect(applyState).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
    expect(result.report).toEqual({
      checkedAt: '2026-03-23T12:00:00.000Z',
      updated: 1,
      alreadyPrivate: 0,
      failed: 0,
      rows: [
        {
          problemId: '00000000-0000-0000-0000-000000000000',
          title: 'Design HashMap',
          reason: 'oop_operations',
          previousVisibility: 'public',
          nextVisibility: 'private',
          nextFunctionSignaturePresent: true,
          remainingNullStructuredTestcaseCount: 0,
          status: 'updated',
        },
      ],
    });
  });

  it('treats already-private schema-complete rows as a successful no-op', async () => {
    const result = await runFunctionSignatureQuarantine({
      rows: [buildRow({ visibility: 'private', functionSignaturePresent: true, nullStructuredTestcaseCount: 0 })],
      unsupportedProblems: [
        { problemId: '00000000-0000-0000-0000-000000000000', reason: 'oop_operations' },
      ],
      applyState: jest.fn(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.alreadyPrivate).toBe(1);
    expect(result.report.rows[0]).toMatchObject({
      status: 'already_private',
      nextFunctionSignaturePresent: true,
      remainingNullStructuredTestcaseCount: 0,
    });
  });

  it('re-materializes rows that are already private but still incomplete', async () => {
    const applyState = jest.fn().mockResolvedValue(buildState());

    const result = await runFunctionSignatureQuarantine({
      rows: [buildRow({ visibility: 'private', functionSignaturePresent: false, nullStructuredTestcaseCount: 1 })],
      unsupportedProblems: [
        { problemId: '00000000-0000-0000-0000-000000000000', reason: 'contest_text_input' },
      ],
      applyState,
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.updated).toBe(1);
    expect(applyState).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000000');
  });

  it('fails when a cataloged unsupported problem is missing from the fetched rows', async () => {
    const result = await runFunctionSignatureQuarantine({
      rows: [],
      unsupportedProblems: [
        { problemId: '00000000-0000-0000-0000-000000000000', reason: 'oop_operations' },
      ],
      applyState: jest.fn(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.failed).toBe(1);
    expect(result.report.rows[0]).toMatchObject({
      problemId: '00000000-0000-0000-0000-000000000000',
      status: 'failed',
      reason: 'oop_operations',
      nextFunctionSignaturePresent: false,
    });
  });

  it('fails when the applied state is still not schema-complete', async () => {
    const result = await runFunctionSignatureQuarantine({
      rows: [buildRow({ visibility: 'exam_only' })],
      unsupportedProblems: [
        { problemId: '00000000-0000-0000-0000-000000000000', reason: 'contest_text_input' },
      ],
      applyState: jest.fn().mockResolvedValue(
        buildState({
          visibility: 'private',
          functionSignaturePresent: true,
          nullStructuredTestcaseCount: 1,
        }),
      ),
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.failed).toBe(1);
    expect(result.report.rows[0]).toMatchObject({
      status: 'failed',
      nextVisibility: 'private',
      reason: 'contest_text_input',
      remainingNullStructuredTestcaseCount: 1,
    });
  });
});
