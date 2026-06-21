import { unsupportedFunctionSignatureProblems } from '../../../scripts/migrate/function-signature-unsupported-catalog';
import {
  buildPostMigrationVerificationSummary,
  collectPostMigrationDbChecks,
  evaluatePostMigrationDbChecks,
  parseJestSummary,
} from '../../../scripts/verify/post-migration-runtime.shared';

describe('post-migration verification helper', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('collects DB checks including function-signature and quarantine counts', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: unsupportedFunctionSignatureProblems.length }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await collectPostMigrationDbChecks({
      dbClient: { execute } as any,
      unsupportedProblems: unsupportedFunctionSignatureProblems,
    });

    expect(result).toEqual({
      testcaseInputColumnCount: 0,
      testcaseOutputColumnCount: 0,
      testcaseInputJsonNullCount: 0,
      testcaseOutputJsonNullCount: 0,
      problemFunctionSignatureNullCount: 0,
      quarantinedExpectedCount: unsupportedFunctionSignatureProblems.length,
      quarantinedPrivateCount: unsupportedFunctionSignatureProblems.length,
    });
  });

  it('flags non-zero DB invariants as failures', () => {
    expect(
      evaluatePostMigrationDbChecks({
        testcaseInputColumnCount: 1,
        testcaseOutputColumnCount: 0,
        testcaseInputJsonNullCount: 0,
        testcaseOutputJsonNullCount: 0,
        problemFunctionSignatureNullCount: 2,
        quarantinedExpectedCount: unsupportedFunctionSignatureProblems.length,
        quarantinedPrivateCount: unsupportedFunctionSignatureProblems.length - 1,
      }),
    ).toEqual([
      'testcaseInputColumnCount',
      'problemFunctionSignatureNullCount',
      'quarantinedPrivateCount',
    ]);
  });

  it('parses the jest JSON summary format used by the deterministic runner', () => {
    const summary = parseJestSummary({
      numPassedTests: 8,
      numFailedTests: 1,
      numPendingTests: 2,
    });

    expect(summary).toEqual({ passed: 8, failed: 1, skipped: 2 });
  });

  it('builds the final post-migration verification summary shape', () => {
    const summary = buildPostMigrationVerificationSummary({
      checkedAt: '2026-03-23T00:00:00.000Z',
      db: {
        testcaseInputColumnCount: 0,
        testcaseOutputColumnCount: 0,
        testcaseInputJsonNullCount: 0,
        testcaseOutputJsonNullCount: 0,
        problemFunctionSignatureNullCount: 0,
        quarantinedExpectedCount: unsupportedFunctionSignatureProblems.length,
        quarantinedPrivateCount: unsupportedFunctionSignatureProblems.length,
      },
      smoke: { passed: 5, failed: 0, skipped: 0 },
      regression: { passed: 12, failed: 0, skipped: 1 },
    });

    expect(summary).toEqual({
      checkedAt: '2026-03-23T00:00:00.000Z',
      db: {
        testcaseInputColumnCount: 0,
        testcaseOutputColumnCount: 0,
        testcaseInputJsonNullCount: 0,
        testcaseOutputJsonNullCount: 0,
        problemFunctionSignatureNullCount: 0,
        quarantinedExpectedCount: unsupportedFunctionSignatureProblems.length,
        quarantinedPrivateCount: unsupportedFunctionSignatureProblems.length,
      },
      smoke: { passed: 5, failed: 0, skipped: 0 },
      regression: { passed: 12, failed: 0, skipped: 1 },
    });
  });
});
