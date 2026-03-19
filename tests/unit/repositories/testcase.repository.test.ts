import { TestcaseRepository } from '@backend/api/repositories/testcase.repository';
import {
  buildFunctionInputDisplayValue,
  canonicalizeStructuredValue,
} from '@backend/shared/utils';
import { FunctionSignature } from '@backend/shared/types';

describe('TestcaseRepository cached display fields', () => {
  const signature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  it('rebuilds cached input and output from structured JSON', () => {
    const repository = new TestcaseRepository();
    const testcase = {
      input: 'stale input cache',
      output: 'stale output cache',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      isPublic: true,
      point: 10,
    };

    const record = (repository as any).normalizeTestcaseRecord('problem-1', testcase, signature);

    expect(record.input).toBe(buildFunctionInputDisplayValue(signature, testcase.inputJson));
    expect(record.output).toBe(canonicalizeStructuredValue(testcase.outputJson));
    expect(record.input).not.toBe(testcase.input);
    expect(record.output).not.toBe(testcase.output);
  });
});
