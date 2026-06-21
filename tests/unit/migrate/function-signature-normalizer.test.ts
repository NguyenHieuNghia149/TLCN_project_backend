import {
  NormalizerError,
  normalizeRuntimeSignature,
} from '../../../scripts/migrate/function-signature-normalizer';

describe('function-signature-normalizer', () => {
  it('passes the recursive canonical shape through unchanged', () => {
    const signature = {
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

    expect(normalizeRuntimeSignature(signature)).toEqual(signature);
  });

  it('normalizes the old flat argument shape into the recursive canonical shape', () => {
    expect(
      normalizeRuntimeSignature({
        name: 'twoSum',
        args: [
          { name: 'nums', type: 'array', items: 'integer' },
          { name: 'target', type: 'integer' },
        ],
        returnType: { type: 'array', items: 'integer' },
      }),
    ).toEqual({
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
    });
  });

  it('normalizes the legacy methodName/parameters shape', () => {
    expect(
      normalizeRuntimeSignature({
        methodName: 'twoSum',
        parameters: [
          { name: 'nums', type: { kind: 'array', element: 'int' } },
          { name: 'target', type: { kind: 'scalar', name: 'int' } },
        ],
        returnType: { kind: 'array', element: 'int' },
      }),
    ).toEqual({
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
    });
  });

  it('supports nullable nodes, nested arrays, and number scalars', () => {
    expect(
      normalizeRuntimeSignature({
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
      }),
    ).toEqual({
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
    });

    expect(
      normalizeRuntimeSignature({
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
      }),
    ).toEqual({
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
    });
  });

  it('rejects unsupported types with the stable error code', () => {
    expect(() =>
      normalizeRuntimeSignature({
        name: 'bad',
        args: [{ name: 'grid', type: 'matrix' }],
        returnType: { type: 'integer' },
      }),
    ).toThrow(NormalizerError);

    try {
      normalizeRuntimeSignature({
        name: 'bad',
        args: [{ name: 'grid', type: 'matrix' }],
        returnType: { type: 'integer' },
      });
    } catch (error) {
      expect((error as NormalizerError).code).toBe('UNSUPPORTED_TYPE');
    }
  });

  it('rejects duplicate argument names', () => {
    try {
      normalizeRuntimeSignature({
        name: 'dup',
        args: [
          { name: 'value', type: 'integer' },
          { name: 'value', type: 'integer' },
        ],
        returnType: { type: 'integer' },
      });
    } catch (error) {
      expect((error as NormalizerError).code).toBe('DUPLICATE_ARG');
    }
  });

  it('rejects missing required fields', () => {
    try {
      normalizeRuntimeSignature({
        name: 'missing',
        args: [],
      });
    } catch (error) {
      expect((error as NormalizerError).code).toBe('MISSING_FIELD');
    }
  });
});
