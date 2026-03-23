import fs from 'node:fs';
import path from 'node:path';

import {
  buildFunctionSignatureManifestTemplate,
  type FunctionSignatureManifestTemplate,
  type FunctionSignatureProblemRow,
  type FunctionSignatureTestcaseRow,
} from '../../../scripts/migrate/function-signature-migrate.shared';
import {
  resolveTemplateOutputPath,
  writeFunctionSignatureManifestTemplate,
} from '../../../scripts/migrate/generate-function-signature-manifest-template';

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

describe('function-signature template generation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a template for only supported problems missing function_signature and separates quarantined rows', () => {
    const template = buildFunctionSignatureManifestTemplate({
      problems: [
        buildProblemRow(),
        buildProblemRow({
          problemId: '11111111-1111-4111-8111-111111111111',
          title: 'Already Canonical',
          functionSignature: {
            name: 'foo',
            args: [],
            returnType: { type: 'integer' },
          },
        }),
        buildProblemRow({
          problemId: '33333333-3333-4333-8333-333333333333',
          title: 'Design HashMap',
        }),
      ],
      testcases: [
        buildTestcaseRow(),
        buildTestcaseRow({
          testcaseId: '44444444-4444-4444-8444-444444444444',
          problemId: '11111111-1111-4111-8111-111111111111',
          inputJson: { value: 1 },
          outputJson: 1,
        }),
        buildTestcaseRow({
          testcaseId: '55555555-5555-4555-8555-555555555555',
          problemId: '33333333-3333-4333-8333-333333333333',
          inputJson: { operations: ['put'] },
          outputJson: [null],
        }),
      ],
      unsupportedProblems: [
        {
          problemId: '33333333-3333-4333-8333-333333333333',
          reason: 'oop_operations',
        },
      ],
      now: () => new Date('2026-03-23T00:00:00.000Z'),
    });

    expect(template).toEqual<FunctionSignatureManifestTemplate>({
      generatedAt: '2026-03-23T00:00:00.000Z',
      quarantined: [
        {
          problemId: '33333333-3333-4333-8333-333333333333',
          title: 'Design HashMap',
          reason: 'oop_operations',
        },
      ],
      problems: [
        {
          problemId: '00000000-0000-0000-0000-000000000000',
          title: 'Two Sum',
          functionSignature: null,
          existingFunctionSignature: null,
          testcases: [
            {
              testcaseId: '22222222-2222-4222-8222-222222222222',
              inputJson: { nums: [2, 7, 11, 15], target: 9 },
              outputJson: [0, 1],
            },
          ],
        },
      ],
    });
  });

  it('honors an explicit output path', () => {
    const resolved = resolveTemplateOutputPath('tmp/custom-template.json');

    expect(resolved).toBe(path.resolve(process.cwd(), 'tmp/custom-template.json'));
  });

  it('defaults the output path under tmp/migrate', () => {
    const resolved = resolveTemplateOutputPath(undefined, () => new Date('2026-03-23T04:05:06.789Z'));

    expect(resolved).toBe(
      path.resolve(
        process.cwd(),
        'tmp',
        'migrate',
        'function-signature-manifest-template-2026-03-23T04-05-06-789Z.json',
      ),
    );
  });

  it('writes the template JSON to disk and ensures the output directory exists', () => {
    const template: FunctionSignatureManifestTemplate = {
      generatedAt: '2026-03-23T00:00:00.000Z',
      quarantined: [],
      problems: [],
    };
    const outputPath = path.resolve(process.cwd(), 'tmp', 'migrate', 'template.json');
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined as never);

    writeFunctionSignatureManifestTemplate(template, outputPath);

    expect(mkdirSpy).toHaveBeenCalledWith(path.dirname(outputPath), { recursive: true });
    expect(writeSpy).toHaveBeenCalledWith(outputPath, JSON.stringify(template, null, 2));
  });
});
