import { FunctionSignature } from '@backend/shared/types';

import {
  buildFunctionSignatureManifestFromCatalog,
  type FunctionSignatureProblemRow,
  type SignatureCatalogEntry,
  type UnsupportedProblemCatalogEntry,
} from '../../../scripts/migrate/function-signature-migrate.shared';

const climbingStairsSignature: FunctionSignature = {
  name: 'climbStairs',
  args: [{ name: 'n', type: { type: 'integer' } }],
  returnType: { type: 'integer' },
};

const customClimbingSignature: FunctionSignature = {
  name: 'countWays',
  args: [{ name: 'steps', type: { type: 'integer' } }],
  returnType: { type: 'integer' },
};

const twoSumSignature: FunctionSignature = {
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
};

function buildProblemRow(
  overrides: Partial<FunctionSignatureProblemRow> = {},
): FunctionSignatureProblemRow {
  return {
    problemId: '00000000-0000-0000-0000-000000000000',
    title: 'Climbing Stairs',
    functionSignature: null,
    ...overrides,
  };
}

describe('function-signature catalog synthesis', () => {
  it('matches unresolved problems by exact title', () => {
    const catalog: SignatureCatalogEntry[] = [
      {
        match: { kind: 'title', title: 'Climbing Stairs' },
        functionSignature: climbingStairsSignature,
      },
    ];

    const result = buildFunctionSignatureManifestFromCatalog({
      catalog,
      problems: [buildProblemRow()],
      unsupportedProblems: [],
      now: () => new Date('2026-03-23T10:00:00.000Z'),
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toEqual({
      checkedAt: '2026-03-23T10:00:00.000Z',
      matched: [
        {
          problemId: '00000000-0000-0000-0000-000000000000',
          title: 'Climbing Stairs',
        },
      ],
      unresolved: [],
      conflicting: [],
      quarantined: [],
    });
    expect(result.manifest).toEqual({
      problems: [
        {
          problemId: '00000000-0000-0000-0000-000000000000',
          functionSignature: climbingStairsSignature,
        },
      ],
    });
  });

  it('gives problemId overrides precedence over shared title entries', () => {
    const catalog: SignatureCatalogEntry[] = [
      {
        match: { kind: 'title', title: 'Climbing Stairs' },
        functionSignature: climbingStairsSignature,
      },
      {
        match: { kind: 'problemId', problemId: '11111111-1111-4111-8111-111111111111' },
        functionSignature: customClimbingSignature,
      },
    ];

    const result = buildFunctionSignatureManifestFromCatalog({
      catalog,
      problems: [
        buildProblemRow(),
        buildProblemRow({
          problemId: '11111111-1111-4111-8111-111111111111',
        }),
      ],
      unsupportedProblems: [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.manifest.problems).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        functionSignature: climbingStairsSignature,
      },
      {
        problemId: '11111111-1111-4111-8111-111111111111',
        functionSignature: customClimbingSignature,
      },
    ]);
  });

  it('reports unresolved problems and exits non-zero when no catalog entry matches', () => {
    const result = buildFunctionSignatureManifestFromCatalog({
      catalog: [],
      problems: [buildProblemRow({ title: 'Unknown Problem' })],
      unsupportedProblems: [],
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary.unresolved).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        title: 'Unknown Problem',
      },
    ]);
    expect(result.manifest).toEqual({ problems: [] });
  });

  it('reports duplicate problemId matches as conflicts', () => {
    const result = buildFunctionSignatureManifestFromCatalog({
      catalog: [
        {
          match: { kind: 'problemId', problemId: '00000000-0000-0000-0000-000000000000' },
          functionSignature: climbingStairsSignature,
        },
        {
          match: { kind: 'problemId', problemId: '00000000-0000-0000-0000-000000000000' },
          functionSignature: customClimbingSignature,
        },
      ],
      problems: [buildProblemRow()],
      unsupportedProblems: [],
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary.conflicting).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        title: 'Climbing Stairs',
        matchedEntries: 2,
      },
    ]);
    expect(result.manifest.problems).toEqual([]);
  });

  it('reports duplicate title-tier matches as conflicts when no problemId override matched', () => {
    const result = buildFunctionSignatureManifestFromCatalog({
      catalog: [
        {
          match: { kind: 'title', title: 'Two Sum' },
          functionSignature: twoSumSignature,
        },
        {
          match: { kind: 'title', title: 'Two Sum' },
          functionSignature: {
            ...twoSumSignature,
            name: 'findPair',
          },
        },
      ],
      problems: [
        buildProblemRow({
          title: 'Two Sum',
        }),
      ],
      unsupportedProblems: [],
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary.conflicting).toEqual([
      {
        problemId: '00000000-0000-0000-0000-000000000000',
        title: 'Two Sum',
        matchedEntries: 2,
      },
    ]);
  });

  it('ignores problems that already have stored signatures', () => {
    const result = buildFunctionSignatureManifestFromCatalog({
      catalog: [
        {
          match: { kind: 'title', title: 'Two Sum' },
          functionSignature: twoSumSignature,
        },
      ],
      problems: [
        buildProblemRow({
          title: 'Two Sum',
          functionSignature: twoSumSignature,
        }),
      ],
      unsupportedProblems: [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.matched).toEqual([]);
    expect(result.manifest.problems).toEqual([]);
  });

  it('routes unsupported problems into the quarantined bucket instead of unresolved', () => {
    const unsupportedProblems: UnsupportedProblemCatalogEntry[] = [
      {
        problemId: '22222222-2222-4222-8222-222222222222',
        reason: 'oop_operations',
      },
    ];

    const result = buildFunctionSignatureManifestFromCatalog({
      catalog: [],
      problems: [
        buildProblemRow({
          problemId: '22222222-2222-4222-8222-222222222222',
          title: 'Design HashMap',
        }),
      ],
      unsupportedProblems,
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.quarantined).toEqual([
      {
        problemId: '22222222-2222-4222-8222-222222222222',
        title: 'Design HashMap',
        reason: 'oop_operations',
      },
    ]);
    expect(result.summary.unresolved).toEqual([]);
    expect(result.manifest.problems).toEqual([]);
  });
});
