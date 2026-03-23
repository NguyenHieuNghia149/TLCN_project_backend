import { generateWrapper } from '../../../apps/worker/src/services/wrapperGenerator';
import { FunctionSignature } from '@backend/shared/types';

describe('wrapper generator recursive function signatures', () => {
  it('builds C++ wrappers for tree arrays with nullable integer nodes', () => {
    const signature: FunctionSignature = {
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

    const wrapper = generateWrapper('cpp', signature, 'class Solution { public: std::vector<int> inorderTraversal(const std::vector<std::optional<int>>& root) { return {}; } };');

    expect(wrapper).toContain('const std::vector<std::optional<int>> root = payload.at("root").get<std::vector<std::optional<int>>>();');
    expect(wrapper).toContain('#include <optional>');
  });

  it('builds Java wrappers for nested array inputs with TypeReference readers', () => {
    const signature: FunctionSignature = {
      name: 'threeSum',
      args: [
        {
          name: 'matrix',
          type: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'integer' },
            },
          },
        },
      ],
      returnType: {
        type: 'integer',
      },
    };

    const wrapper = generateWrapper('java', signature, 'class Solution { int threeSum(List<List<Integer>> matrix) { return 0; } }');

    expect(wrapper).toContain('import com.fasterxml.jackson.core.type.TypeReference;');
    expect(wrapper).toContain('List<List<Integer>> matrix = readTypedValue(payload, "matrix", new TypeReference<List<List<Integer>>>() {});');
  });

  it('builds Python wrappers that normalize legacy flat signatures and validate number types', () => {
    const wrapper = generateWrapper(
      'python',
      {
        name: 'findMedianSortedArrays',
        args: [
          { name: 'nums1', type: 'array', items: 'integer' },
          { name: 'nums2', type: 'array', items: 'integer' },
        ],
        returnType: { type: 'number' },
      },
      'class Solution:\n    def findMedianSortedArrays(self, nums1, nums2):\n        return 0.0',
    );

    expect(wrapper).toContain('"type":"number"');
    expect(wrapper).toContain('type_name == "number"');
    expect(wrapper).toContain('_assert_type(nums1, SIGNATURE["args"][0]["type"], "nums1")');
  });
});
