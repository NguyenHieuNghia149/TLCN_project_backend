import {
  buildFunctionSignatureAuditReport,
  parseFunctionSignatureManifest,
  planFunctionSignatureBackfill,
  type FunctionSignatureProblemRow,
  type FunctionSignatureTestcaseRow,
  type UnsupportedProblemCatalogEntry,
} from '../../../scripts/migrate/function-signature-migrate.shared';

const canonicalSignature = {
  name: 'twoSum',
  args: [
    {
      name: 'nums',
      type: {
        type: 'array',
        items: { type: 'integer' },
      },
    },
    { name: 'target', type: { type: 'integer' } },
  ],
  returnType: {
    type: 'array',
    items: { type: 'integer' },
  },
} as const;

const legacySignature = {
  methodName: 'twoSum',
  parameters: [
    { name: 'nums', type: { kind: 'array', element: 'int' } },
    { name: 'target', type: { kind: 'scalar', name: 'int' } },
  ],
  returnType: { kind: 'array', element: 'int' },
} as const;

function buildProblemRow(
  overrides: Partial<FunctionSignatureProblemRow> = {},
): FunctionSignatureProblemRow {
  return {
    problemId: '00000000-0000-0000-0000-000000000000',
    title: 'Two Sum',
    functionSignature: null,
    ...overrides,
  };
}

function buildTestcaseRow(
  overrides: Partial<FunctionSignatureTestcaseRow> = {},
): FunctionSignatureTestcaseRow {
  return {
    testcaseId: '22222222-2222-4222-8222-222222222222',
    problemId: '00000000-0000-0000-0000-000000000000',
    inputJson: { nums: [2, 7, 11, 15], target: 9 },
    outputJson: [0, 1],
    ...overrides,
  };
}

function buildManifest(rawProblem: Record<string, unknown>) {
  return parseFunctionSignatureManifest(
    JSON.stringify({
      problems: [rawProblem],
    }),
  );
}

describe('function-signature migrate shared helpers', () => {
  it('builds an audit report that lists missing signatures', () => {
    const report = buildFunctionSignatureAuditReport({
      manifest: { problems: [] },
      manifestPath: null,
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow({ inputJson: null })],
      unsupportedProblems: [],
      now: () => new Date('2026-03-22T00:00:00.000Z'),
    });

    expect(report.checkedAt).toBe('2026-03-22T00:00:00.000Z');
    expect(report.problemsMissingFunctionSignature).toEqual([
      { problemId: '00000000-0000-0000-0000-000000000000', title: 'Two Sum' },
    ]);
    expect(report.testcasesMissingStructuredJson).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        testcaseId: '22222222-2222-4222-8222-222222222222',
      },
    ]);
    expect(report.summary).toEqual({
      canBackfillNow: 0,
      requiresManifestEntry: 1,
      alreadyCanonical: 0,
      quarantinedUnsupported: 0,
    });
  });

  it('excludes unsupported problemIds from requiresManifestEntry and reports them separately', () => {
    const unsupportedProblems: UnsupportedProblemCatalogEntry[] = [
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        reason: 'oop_operations',
      },
    ];

    const report = buildFunctionSignatureAuditReport({
      manifest: { problems: [] },
      manifestPath: null,
      problems: [buildProblemRow({ title: 'Design HashMap' })],
      testcases: [],
      unsupportedProblems,
      now: () => new Date('2026-03-22T00:00:00.000Z'),
    });

    expect(report.quarantined).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        title: 'Design HashMap',
        reason: 'oop_operations',
      },
    ]);
    expect(report.summary).toEqual({
      canBackfillNow: 0,
      requiresManifestEntry: 0,
      alreadyCanonical: 0,
      quarantinedUnsupported: 1,
    });
  });

  it('plans a valid manifest entry as an updated problem signature', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: canonicalSignature,
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
      now: () => new Date('2026-03-22T00:00:00.000Z'),
    });

    expect(planned.exitCode).toBe(0);
    expect(planned.summary.updated).toBe(1);
    expect(planned.operations).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        signature: canonicalSignature,
        status: 'updated',
      },
    ]);
  });

  it('skips a problem that already stores the same canonical signature', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: canonicalSignature,
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow({ functionSignature: canonicalSignature })],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(0);
    expect(planned.summary.skipped).toBe(1);
    expect(planned.operations[0]).toMatchObject({ status: 'skipped' });
  });

  it('fails when the manifest contains a problemId that does not exist in DB', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '11111111-1111-4111-8111-111111111111',
        functionSignature: canonicalSignature,
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(1);
    expect(planned.summary.results).toContainEqual({
      problemId: '11111111-1111-4111-8111-111111111111',
      status: 'failed',
      reason: 'problem_not_found',
    });
  });

  it('warns when a DB problem is missing from the manifest', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: { problems: [] },
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(0);
    expect(planned.summary.warnings).toBe(1);
    expect(planned.summary.results).toContainEqual({
      problemId: '00000000-0000-0000-0000-000000000000',
      status: 'warning',
      reason: 'missing_manifest_entry',
    });
  });

  it('fails when a manifest testcaseId does not exist in DB', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: canonicalSignature,
        testcases: [
          {
            testcaseId: '99999999-9999-4999-8999-999999999999',
            inputJson: { nums: [2, 7, 11, 15], target: 9 },
            outputJson: [0, 1],
          },
        ],
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(1);
    expect(planned.summary.results[0]).toMatchObject({
      status: 'failed',
      reason: 'manifest_testcase_not_found:99999999-9999-4999-8999-999999999999',
    });
  });

  it('fails when a manifest testcase payload is invalid for the signature', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: canonicalSignature,
        testcases: [
          {
            testcaseId: '22222222-2222-4222-8222-222222222222',
            inputJson: { nums: ['x'], target: 9 },
            outputJson: [0, 1],
          },
        ],
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(1);
    expect(planned.summary.results[0]).toMatchObject({
      status: 'failed',
      reason:
        'invalid_manifest_testcase_input:22222222-2222-4222-8222-222222222222:Invalid input type for argument: nums',
    });
  });

  it('fails when existing DB testcase JSON is incompatible with the signature', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: canonicalSignature,
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [
        buildTestcaseRow({
          inputJson: { nums: ['x'], target: 9 },
        }),
      ],
    });

    expect(planned.exitCode).toBe(1);
    expect(planned.summary.results[0]).toMatchObject({
      status: 'failed',
      reason:
        'existing_db_input_json_invalid:22222222-2222-4222-8222-222222222222:Invalid input type for argument: nums',
    });
  });

  it('allows manifest testcases to be omitted when DB already has structured JSON', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: canonicalSignature,
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(0);
    expect(planned.summary.failed).toBe(0);
  });

  it('normalizes legacy manifest signatures before planning the update', () => {
    const planned = planFunctionSignatureBackfill({
      manifest: buildManifest({
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: legacySignature,
      }),
      manifestPath: 'manifest.json',
      problems: [buildProblemRow()],
      testcases: [buildTestcaseRow()],
    });

    expect(planned.exitCode).toBe(0);
    expect(planned.operations[0]).toEqual({
      problemId: '00000000-0000-0000-0000-000000000000',
      signature: canonicalSignature,
      status: 'updated',
    });
  });
});
