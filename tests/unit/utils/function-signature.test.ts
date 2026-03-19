import {
  buildFunctionInputDisplayValue,
  buildTestcaseDisplay,
  canonicalizeStructuredValue,
} from '@backend/shared/utils';
import { FunctionSignature } from '@backend/shared/types';

describe('function-signature display helpers', () => {
  const signature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  it('formats input display from structured JSON in signature order', () => {
    expect(
      buildFunctionInputDisplayValue(signature, {
        nums: [1, 2, 3],
        target: 5,
      })
    ).toBe('nums: [1, 2, 3]\ntarget: 5');
  });

  it('canonicalizes structured output as JSON text', () => {
    expect(canonicalizeStructuredValue([0, 1])).toBe('[0,1]');
    expect(canonicalizeStructuredValue(true)).toBe('true');
  });

  it('builds testcase display from structured input and output', () => {
    expect(
      buildTestcaseDisplay(signature, {
        inputJson: { nums: [1, 2, 3], target: 5 },
        outputJson: [0, 2],
      })
    ).toEqual({
      input: 'nums: [1, 2, 3]\ntarget: 5',
      output: '[0,2]',
    });
  });
});