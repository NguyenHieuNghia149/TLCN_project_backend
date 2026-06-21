import { CreateProblemSchema } from '@backend/shared/validations/problem.validation';

describe('problem validation function-signature normalization', () => {
  it('accepts legacy flat signatures and normalizes them into canonical recursive shape', () => {
    const parsed = CreateProblemSchema.parse({
      title: 'Two Sum',
      description: 'Find two indices.',
      difficulty: 'easy',
      constraint: '1 <= n <= 10^4',
      functionSignature: {
        name: 'twoSum',
        args: [
          { name: 'nums', type: 'array', items: 'integer' },
          { name: 'target', type: 'integer' },
        ],
        returnType: { type: 'array', items: 'integer' },
      },
      testcases: [
        {
          inputJson: { nums: [2, 7, 11, 15], target: 9 },
          outputJson: [0, 1],
          isPublic: true,
          point: 10,
        },
      ],
    });

    expect(parsed.functionSignature).toEqual({
      name: 'twoSum',
      args: [
        { name: 'nums', type: { type: 'array', items: { type: 'integer' } } },
        { name: 'target', type: { type: 'integer' } },
      ],
      returnType: { type: 'array', items: { type: 'integer' } },
    });
  });

  it('accepts recursive nullable and number signatures with structured testcases', () => {
    const parsed = CreateProblemSchema.parse({
      title: 'Median of Two Sorted Arrays',
      description: 'Find the median.',
      difficulty: 'hard',
      constraint: 'm + n >= 1',
      functionSignature: {
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
          {
            name: 'tree',
            type: {
              type: 'array',
              items: {
                type: 'nullable',
                value: { type: 'integer' },
              },
            },
          },
        ],
        returnType: { type: 'number' },
      },
      testcases: [
        {
          inputJson: {
            nums1: [1, 3],
            nums2: [2],
            tree: [1, null, 2, 3],
          },
          outputJson: 2.5,
          isPublic: false,
          point: 10,
        },
      ],
    });

    expect(parsed.functionSignature).toEqual({
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
        {
          name: 'tree',
          type: {
            type: 'array',
            items: {
              type: 'nullable',
              value: { type: 'integer' },
            },
          },
        },
      ],
      returnType: { type: 'number' },
    });
  });
});
