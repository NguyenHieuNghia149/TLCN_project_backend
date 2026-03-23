import {
  buildFunctionInputDisplayValue,
  buildStarterCodeByLanguage,
  buildTestcaseDisplay,
  canonicalizeStructuredValue,
} from '@backend/shared/utils';
import { FunctionSignature } from '@backend/shared/types';

describe('function-signature display helpers', () => {
  const signature: FunctionSignature = {
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

  it('formats nullable tree arrays and nested outputs deterministically', () => {
    const treeSignature: FunctionSignature = {
      name: 'inorderTraversal',
      args: [
        {
          name: 'root',
          type: {
            type: 'array',
            items: {
              type: 'nullable',
              value: { type: 'integer' },
            },
          },
        },
      ],
      returnType: {
        type: 'array',
        items: { type: 'integer' },
      },
    };

    expect(
      buildFunctionInputDisplayValue(treeSignature, {
        root: [1, null, 2, 3],
      }),
    ).toBe('root: [1, null, 2, 3]');

    expect(
      buildTestcaseDisplay(treeSignature, {
        inputJson: { root: [1, null, 2, 3] },
        outputJson: [1, 3, 2],
      }),
    ).toEqual({
      input: 'root: [1, null, 2, 3]',
      output: '[1,3,2]',
    });
  });

  it('generates starter code for recursive array and number signatures', () => {
    const signatureWithNestedOutput: FunctionSignature = {
      name: 'groupAnagrams',
      args: [
        {
          name: 'strs',
          type: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      ],
      returnType: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
    const medianSignature: FunctionSignature = {
      name: 'findMedianSortedArrays',
      args: [
        {
          name: 'nums1',
          type: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
        {
          name: 'nums2',
          type: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
      ],
      returnType: { type: 'number' },
    };

    const groupAnagramsStarter = buildStarterCodeByLanguage(signatureWithNestedOutput);
    const medianStarter = buildStarterCodeByLanguage(medianSignature);

    expect(groupAnagramsStarter.cpp).toContain('std::vector<std::vector<std::string>>');
    expect(groupAnagramsStarter.java).toContain('List<List<String>>');
    expect(groupAnagramsStarter.python).toContain('List[List[str]]');
    expect(medianStarter.cpp).toContain('double findMedianSortedArrays');
    expect(medianStarter.java).toContain('double findMedianSortedArrays');
    expect(medianStarter.python).toContain('-> float');
  });
});
