import { CanonicalFunctionTypeNode, FunctionSignature } from '@backend/shared/types';

import { type SignatureCatalogEntry } from './function-signature-migrate.shared';

function scalar(type: CanonicalFunctionTypeNode['type'] extends infer T ? T : never): CanonicalFunctionTypeNode {
  return { type: type as CanonicalFunctionTypeNode['type'] } as CanonicalFunctionTypeNode;
}

function array(items: CanonicalFunctionTypeNode): CanonicalFunctionTypeNode {
  return { type: 'array', items };
}

function nullable(value: CanonicalFunctionTypeNode): CanonicalFunctionTypeNode {
  return { type: 'nullable', value };
}

function signature(
  name: string,
  args: Array<{ name: string; type: CanonicalFunctionTypeNode }>,
  returnType: CanonicalFunctionTypeNode,
): FunctionSignature {
  return { name, args, returnType };
}

const intNode = scalar('integer');
const numberNode = scalar('number');
const stringNode = scalar('string');
const booleanNode = scalar('boolean');
const intArrayNode = array(intNode);
const stringArrayNode = array(stringNode);
const nullableIntArrayNode = array(nullable(intNode));

const climbingStairsSignature = signature('climbStairs', [{ name: 'n', type: intNode }], intNode);
const lengthOfLongestSubstringSignature = signature(
  'lengthOfLongestSubstring',
  [{ name: 's', type: stringNode }],
  intNode,
);
const twoSumSignature = signature(
  'twoSum',
  [
    { name: 'nums', type: intArrayNode },
    { name: 'target', type: intNode },
  ],
  intArrayNode,
);
const maxProfitSignature = signature('maxProfit', [{ name: 'prices', type: intArrayNode }], intNode);
const containsDuplicateSignature = signature(
  'containsDuplicate',
  [{ name: 'nums', type: intArrayNode }],
  booleanNode,
);
const maximumSubarraySignature = signature('maxSubArray', [{ name: 'nums', type: intArrayNode }], intNode);
const mergeTwoSortedListsSignature = signature(
  'mergeTwoLists',
  [
    { name: 'list1', type: intArrayNode },
    { name: 'list2', type: intArrayNode },
  ],
  intArrayNode,
);
const palindromeNumberSignature = signature('isPalindrome', [{ name: 'x', type: intNode }], booleanNode);
const productExceptSelfSignature = signature(
  'productExceptSelf',
  [{ name: 'nums', type: intArrayNode }],
  intArrayNode,
);
const removeDuplicatesSignature = signature(
  'removeDuplicates',
  [{ name: 'nums', type: intArrayNode }],
  intNode,
);
const reverseLinkedListSignature = signature(
  'reverseList',
  [{ name: 'head', type: intArrayNode }],
  intArrayNode,
);
const validParenthesesSignature = signature('isValid', [{ name: 's', type: stringNode }], booleanNode);
const romanToIntegerSignature = signature('romanToInt', [{ name: 's', type: stringNode }], intNode);
const echoIntegerSignature = signature('echoValue', [{ name: 'value', type: intNode }], intNode);
const inorderTraversalSignature = signature(
  'inorderTraversal',
  [{ name: 'root', type: nullableIntArrayNode }],
  intArrayNode,
);
const maxDepthSignature = signature('maxDepth', [{ name: 'root', type: nullableIntArrayNode }], intNode);
const hasPathSumSignature = signature(
  'hasPathSum',
  [
    { name: 'root', type: nullableIntArrayNode },
    { name: 'targetSum', type: intNode },
  ],
  booleanNode,
);
const sameTreeSignature = signature(
  'isSameTree',
  [
    { name: 'p', type: nullableIntArrayNode },
    { name: 'q', type: nullableIntArrayNode },
  ],
  booleanNode,
);
const symmetricTreeSignature = signature(
  'isSymmetric',
  [{ name: 'root', type: nullableIntArrayNode }],
  booleanNode,
);
const threeSumSignature = signature(
  'threeSum',
  [{ name: 'nums', type: intArrayNode }],
  array(intArrayNode),
);
const groupAnagramsSignature = signature(
  'groupAnagrams',
  [{ name: 'strs', type: stringArrayNode }],
  array(stringArrayNode),
);
const medianOfTwoSortedArraysSignature = signature(
  'findMedianSortedArrays',
  [
    { name: 'nums1', type: intArrayNode },
    { name: 'nums2', type: intArrayNode },
  ],
  numberNode,
);

/** Canonical repo-owned function signatures for the active rollforward flow. */
export const functionSignatureCatalog: SignatureCatalogEntry[] = [
  { match: { kind: 'title', title: 'Climbing Stairs' }, functionSignature: climbingStairsSignature },
  {
    match: { kind: 'title', title: 'Longest Substring Without Repeating Characters' },
    functionSignature: lengthOfLongestSubstringSignature,
  },
  { match: { kind: 'title', title: 'Two Sum' }, functionSignature: twoSumSignature },
  { match: { kind: 'title', title: 'Best Time to Buy and Sell Stock' }, functionSignature: maxProfitSignature },
  { match: { kind: 'title', title: 'Contains Duplicate' }, functionSignature: containsDuplicateSignature },
  { match: { kind: 'title', title: 'Maximum Subarray' }, functionSignature: maximumSubarraySignature },
  { match: { kind: 'title', title: 'Merge Two Sorted Lists' }, functionSignature: mergeTwoSortedListsSignature },
  { match: { kind: 'title', title: 'Palindrome Number' }, functionSignature: palindromeNumberSignature },
  { match: { kind: 'title', title: 'Product of Array Except Self' }, functionSignature: productExceptSelfSignature },
  { match: { kind: 'title', title: 'Remove Duplicates from Sorted Array' }, functionSignature: removeDuplicatesSignature },
  { match: { kind: 'title', title: 'Reverse Linked List' }, functionSignature: reverseLinkedListSignature },
  { match: { kind: 'title', title: 'Valid Parentheses' }, functionSignature: validParenthesesSignature },
  {
    match: { kind: 'title', title: 'Binary Tree Inorder Traversal' },
    functionSignature: inorderTraversalSignature,
  },
  {
    match: { kind: 'title', title: 'Maximum Depth of Binary Tree' },
    functionSignature: maxDepthSignature,
  },
  { match: { kind: 'title', title: 'Path Sum' }, functionSignature: hasPathSumSignature },
  { match: { kind: 'title', title: 'Same Tree' }, functionSignature: sameTreeSignature },
  { match: { kind: 'title', title: 'Symmetric Tree' }, functionSignature: symmetricTreeSignature },
  { match: { kind: 'title', title: '3Sum' }, functionSignature: threeSumSignature },
  { match: { kind: 'title', title: 'Group Anagrams' }, functionSignature: groupAnagramsSignature },
  {
    match: { kind: 'title', title: 'Median of Two Sorted Arrays' },
    functionSignature: medianOfTwoSortedArraysSignature,
  },
  {
    match: { kind: 'problemId', problemId: 'fcdb37a8-3347-4073-9ab5-e2bb95fa792b' },
    functionSignature: romanToIntegerSignature,
  },
  {
    match: { kind: 'problemId', problemId: '70582ebc-5b62-473a-b1e7-84479978f554' },
    functionSignature: echoIntegerSignature,
  },
];
