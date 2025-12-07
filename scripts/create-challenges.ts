#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { ChallengeService } from '../src/services/challenge.service';
import { ProblemInput } from '../src/validations/problem.validation';
import { DatabaseService } from '../src/database/connection';
import { ProblemVisibility } from '../src/enums/problemVisibility.enum';

// Load environment variables
config();

// Sample challenges data
const challenges: ProblemInput[] = [
  {
    title: 'Binary Tree Inorder Traversal',
    description: `<p>Given the root of a binary tree, return <em>the inorder traversal of its nodes' values</em>.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [1,null,2,3]</code></p>
<p><strong>Output:</strong> <code>[1,3,2]</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = []</code></p>
<p><strong>Output:</strong> <code>[]</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      'The number of nodes in the tree is in the range [0, 100].\n-100 <= Node.val <= 100',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'binary-tree', 'stack'],
    testcases: [
      {
        input: '{"root": [1,null,2,3]}',
        output: '[1,3,2]',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": []}',
        output: '[]',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": [1]}',
        output: '[1]',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Binary Tree Inorder Traversal Solution',
      description: 'Recursive and iterative approaches',
      videoUrl: 'https://www.youtube.com/watch?v=g_S5WuasWUE',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Recursive Approach',
          description: 'Use recursion to traverse left, root, right',
          sourceCode: `function inorderTraversal(root: TreeNode | null): number[] {
    const result: number[] = [];
    
    function traverse(node: TreeNode | null) {
        if (!node) return;
        traverse(node.left);
        result.push(node.val);
        traverse(node.right);
    }
    
    traverse(root);
    return result;
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(n)',
          explanation:
            'Recursively traverse left subtree, visit root, then traverse right subtree.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Design HashMap',
    description: `<p>Design a HashMap without using any built-in hash table libraries.</p>
<p>Implement the <code>MyHashMap</code> class:</p>
<ul>
<li><code>MyHashMap()</code> initializes the object with an empty map.</li>
<li><code>put(key, value)</code> inserts a <code>(key, value)</code> pair into the HashMap.</li>
<li><code>get(key)</code> returns the <code>value</code> to which the specified <code>key</code> is mapped, or <code>-1</code> if this map contains no mapping for the <code>key</code>.</li>
<li><code>remove(key)</code> removes the <code>key</code> and its corresponding <code>value</code> if the map contains the mapping for the <code>key</code>.</li>
</ul>`,
    difficulty: 'easy',
    constraint: '0 <= key, value <= 10^6\nAt most 10^4 calls will be made to put, get, and remove.',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'hash-table', 'design'],
    testcases: [
      {
        input: '["MyHashMap","put","put","get","get","put","get","remove","get"]',
        output: '[null,null,null,1,-1,null,-1,null,-1]',
        isPublic: true,
        point: 10,
      },
    ],
    solution: {
      title: 'Design HashMap Solution',
      description: 'Implement hash map using array with collision handling',
      videoUrl: 'https://www.youtube.com/watch?v=ISir207RuKQ',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Array-based Approach',
          description: 'Use array with modulo hashing',
          sourceCode: `class MyHashMap {
    private data: number[];
    
    constructor() {
        this.data = new Array(1000001).fill(-1);
    }
    
    put(key: number, value: number): void {
        this.data[key] = value;
    }
    
    get(key: number): number {
        return this.data[key];
    }
    
    remove(key: number): void {
        this.data[key] = -1;
    }
}`,
          language: 'typescript',
          timeComplexity: 'O(1)',
          spaceComplexity: 'O(n)',
          explanation: 'Use a large array to store key-value pairs directly indexed by key.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Climbing Stairs',
    description: `<p>You are climbing a staircase. It takes <code>n</code> steps to reach the top.</p>
<p>Each time you can either climb <code>1</code> or <code>2</code> steps. In how many distinct ways can you climb to the top?</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>n = 2</code></p>
<p><strong>Output:</strong> <code>2</code></p>
<p><strong>Explanation:</strong> There are two ways to climb to the top. 1. 1 step + 1 step 2. 2 steps</p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>n = 3</code></p>
<p><strong>Output:</strong> <code>3</code></p>
</div>`,
    difficulty: 'easy',
    constraint: '1 <= n <= 45',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['dynamic-programming', 'math', 'memoization'],
    testcases: [
      {
        input: '2',
        output: '2',
        isPublic: true,
        point: 10,
      },
      {
        input: '3',
        output: '3',
        isPublic: true,
        point: 10,
      },
      {
        input: '5',
        output: '8',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Climbing Stairs Solution',
      description: 'Fibonacci sequence pattern',
      videoUrl: 'https://www.youtube.com/watch?v=Y0lT9Fck7qI',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Dynamic Programming',
          description: 'Bottom-up approach with O(1) space',
          sourceCode: `function climbStairs(n: number): number {
    if (n <= 2) return n;
    
    let first = 1;
    let second = 2;
    
    for (let i = 3; i <= n; i++) {
        const third = first + second;
        first = second;
        second = third;
    }
    
    return second;
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(1)',
          explanation:
            'This follows the Fibonacci sequence. The number of ways to reach step n is the sum of ways to reach step n-1 and n-2.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Roman to Integer',
    description: `<p>Implement a first in first out (FIFO) queue using only two stacks. The implemented queue should support all the functions of a normal queue (<code>push</code>, <code>peek</code>, <code>pop</code>, and <code>empty</code>).</p>
<h3>Example:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>["MyQueue", "push", "push", "peek", "pop", "empty"]</code></p>
<p><strong>Output:</strong> <code>[null, null, null, 1, 1, false]</code></p>
</div>`,
    difficulty: 'easy',
    constraint: '1 <= x <= 9\nAt most 100 calls will be made to push, pop, peek, and empty.',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'stack', 'queue'],
    testcases: [
      {
        input: '["MyQueue","push","push","peek","pop","empty"]',
        output: '[null,null,null,1,1,false]',
        isPublic: true,
        point: 10,
      },
      {
        input: '["MyQueue","push","pop","empty"]',
        output: '[null,null,1,true]',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Implement Queue using Stacks Solution',
      description: 'Use two stacks to simulate queue behavior',
      videoUrl: 'https://www.youtube.com/watch?v=3Et9MrMc02A',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Two Stack Approach',
          description: 'Use input and output stacks',
          sourceCode: `class MyQueue {
    private input: number[] = [];
    private output: number[] = [];
    
    push(x: number): void {
        this.input.push(x);
    }
    
    pop(): number {
        this.peek();
        return this.output.pop()!;
    }
    
    peek(): number {
        if (this.output.length === 0) {
            while (this.input.length > 0) {
                this.output.push(this.input.pop()!);
            }
        }
        return this.output[this.output.length - 1];
    }
    
    empty(): boolean {
        return this.input.length === 0 && this.output.length === 0;
    }
}`,
          language: 'typescript',
          timeComplexity: 'O(1) amortized',
          spaceComplexity: 'O(n)',
          explanation:
            'Use two stacks: one for input and one for output. When output is empty, transfer all elements from input to output.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Design HashMap',
    description: `<p>Design a HashMap without using any built-in hash table libraries.</p>
<p>Implement the <code>MyHashMap</code> class:</p>
<ul>
<li><code>MyHashMap()</code> initializes the object with an empty map.</li>
<li><code>put(key, value)</code> inserts a <code>(key, value)</code> pair into the HashMap.</li>
<li><code>get(key)</code> returns the <code>value</code> to which the specified <code>key</code> is mapped, or <code>-1</code> if this map contains no mapping for the <code>key</code>.</li>
<li><code>remove(key)</code> removes the <code>key</code> and its corresponding <code>value</code> if the map contains the mapping for the <code>key</code>.</li>
</ul>`,
    difficulty: 'easy',
    constraint: '0 <= key, value <= 10^6\nAt most 10^4 calls will be made to put, get, and remove.',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'hash-table', 'design'],
    testcases: [
      {
        input: '["MyHashMap","put","put","get","get","put","get","remove","get"]',
        output: '[null,null,null,1,-1,null,-1,null,-1]',
        isPublic: true,
        point: 10,
      },
    ],
    solution: {
      title: 'Design HashMap Solution',
      description: 'Implement hash map using array with collision handling',
      videoUrl: 'https://www.youtube.com/watch?v=ISir207RuKQ',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Array-based Approach',
          description: 'Use array with modulo hashing',
          sourceCode: `class MyHashMap {
    private data: number[];
    
    constructor() {
        this.data = new Array(1000001).fill(-1);
    }
    
    put(key: number, value: number): void {
        this.data[key] = value;
    }
    
    get(key: number): number {
        return this.data[key];
    }
    
    remove(key: number): void {
        this.data[key] = -1;
    }
}`,
          language: 'typescript',
          timeComplexity: 'O(1)',
          spaceComplexity: 'O(n)',
          explanation: 'Use a large array to store key-value pairs directly indexed by key.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Climbing Stairs',
    description: `<p>You are climbing a staircase. It takes <code>n</code> steps to reach the top.</p>
<p>Each time you can either climb <code>1</code> or <code>2</code> steps. In how many distinct ways can you climb to the top?</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>n = 2</code></p>
<p><strong>Output:</strong> <code>2</code></p>
<p><strong>Explanation:</strong> There are two ways to climb to the top. 1. 1 step + 1 step 2. 2 steps</p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>n = 3</code></p>
<p><strong>Output:</strong> <code>3</code></p>
</div>`,
    difficulty: 'easy',
    constraint: '1 <= n <= 45',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['dynamic-programming', 'math', 'memoization'],
    testcases: [
      {
        input: '2',
        output: '2',
        isPublic: true,
        point: 10,
      },
      {
        input: '3',
        output: '3',
        isPublic: true,
        point: 10,
      },
      {
        input: '5',
        output: '8',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Climbing Stairs Solution',
      description: 'Fibonacci sequence pattern',
      videoUrl: 'https://www.youtube.com/watch?v=Y0lT9Fck7qI',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Dynamic Programming',
          description: 'Bottom-up approach with O(1) space',
          sourceCode: `function climbStairs(n: number): number {
    if (n <= 2) return n;
    
    let first = 1;
    let second = 2;
    
    for (let i = 3; i <= n; i++) {
        const third = first + second;
        first = second;
        second = third;
    }
    
    return second;
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(1)',
          explanation:
            'This follows the Fibonacci sequence. The number of ways to reach step n is the sum of ways to reach step n-1 and n-2.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Roman to Integer',
    description: `<p>Roman numerals are represented by seven different symbols: <code>I</code>, <code>V</code>, <code>X</code>, <code>L</code>, <code>C</code>, <code>D</code> and <code>M</code>.</p>
<p>Given a roman numeral, convert it to an integer.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>s = "III"</code></p>
<p><strong>Output:</strong> <code>3</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>s = "LVIII"</code></p>
<p><strong>Output:</strong> <code>58</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      '1 <= s.length <= 15\ns contains only the characters (I, V, X, L, C, D, M).\nIt is guaranteed that s is a valid roman numeral in the range [1, 3999].',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['string', 'math'],
    testcases: [
      {
        input: '"III"',
        output: '3',
        isPublic: true,
        point: 10,
      },
      {
        input: '"LVIII"',
        output: '58',
        isPublic: true,
        point: 10,
      },
      {
        input: '"MCMXCIV"',
        output: '1994',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Roman to Integer Solution',
      description: 'Process from right to left',
      videoUrl: 'https://www.youtube.com/watch?v=3jdxYj3DD98',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Right to Left Approach',
          description: 'Process characters from right to left',
          sourceCode: `function romanToInt(s: string): number {
    const map: Record<string, number> = {
        'I': 1,
        'V': 5,
        'X': 10,
        'L': 50,
        'C': 100,
        'D': 500,
        'M': 1000
    };
    
    let result = 0;
    let prev = 0;
    
    for (let i = s.length - 1; i >= 0; i--) {
        const current = map[s[i]];
        if (current < prev) {
            result -= current;
        } else {
            result += current;
        }
        prev = current;
    }
    
    return result;
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(1)',
          explanation:
            'Process from right to left. If current value is less than previous, subtract it; otherwise add it.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Palindrome Number',
    description: `<p>Given an integer <code>x</code>, return <code>true</code> if <code>x</code> is a palindrome, and <code>false</code> otherwise.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>x = 121</code></p>
<p><strong>Output:</strong> <code>true</code></p>
<p><strong>Explanation:</strong> 121 reads as 121 from left to right and from right to left.</p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>x = -121</code></p>
<p><strong>Output:</strong> <code>false</code></p>
</div>`,
    difficulty: 'easy',
    constraint: '-2^31 <= x <= 2^31 - 1',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['math'],
    testcases: [
      {
        input: '121',
        output: 'true',
        isPublic: true,
        point: 10,
      },
      {
        input: '-121',
        output: 'false',
        isPublic: true,
        point: 10,
      },
      {
        input: '10',
        output: 'false',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Palindrome Number Solution',
      description: 'Reverse half of the number',
      videoUrl: 'https://www.youtube.com/watch?v=yubRKwixN-U',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Reverse Half Approach',
          description: 'Reverse only half of the number',
          sourceCode: `function isPalindrome(x: number): boolean {
    if (x < 0 || (x % 10 === 0 && x !== 0)) {
        return false;
    }
    
    let reversed = 0;
    while (x > reversed) {
        reversed = reversed * 10 + x % 10;
        x = Math.floor(x / 10);
    }
    
    return x === reversed || x === Math.floor(reversed / 10);
}`,
          language: 'typescript',
          timeComplexity: 'O(log n)',
          spaceComplexity: 'O(1)',
          explanation: 'Reverse only half of the number and compare with the other half.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Remove Duplicates from Sorted Array',
    description: `<p>Given an integer array <code>nums</code> sorted in <strong>non-decreasing order</strong>, remove the duplicates <strong><a href="https://en.wikipedia.org/wiki/In-place_algorithm" target="_blank">in-place</a></strong> such that each unique element appears only <strong>once</strong>. The <strong>relative order</strong> of the elements should be kept the <strong>same</strong>.</p>
<p>Return <code>k</code><em> after placing the final result in the first </em><code>k</code><em> slots of </em><code>nums</code>.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>nums = [1,1,2]</code></p>
<p><strong>Output:</strong> <code>2, nums = [1,2,_]</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>nums = [0,0,1,1,1,2,2,3,3,4]</code></p>
<p><strong>Output:</strong> <code>5, nums = [0,1,2,3,4,_,_,_,_,_]</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      '1 <= nums.length <= 3 * 10^4\n-100 <= nums[i] <= 100\nnums is sorted in non-decreasing order.',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['array', 'two-pointers'],
    testcases: [
      {
        input: '[1,1,2]',
        output: '2',
        isPublic: true,
        point: 10,
      },
      {
        input: '[0,0,1,1,1,2,2,3,3,4]',
        output: '5',
        isPublic: true,
        point: 10,
      },
      {
        input: '[1,1,1]',
        output: '1',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Remove Duplicates from Sorted Array Solution',
      description: 'Use two pointers technique',
      videoUrl: 'https://www.youtube.com/watch?v=DEJAZBq0FDA',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Two Pointers Approach',
          description: 'Use slow and fast pointers',
          sourceCode: `function removeDuplicates(nums: number[]): number {
    if (nums.length === 0) return 0;
    
    let slow = 0;
    for (let fast = 1; fast < nums.length; fast++) {
        if (nums[fast] !== nums[slow]) {
            slow++;
            nums[slow] = nums[fast];
        }
    }
    
    return slow + 1;
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(1)',
          explanation:
            'Use two pointers: slow pointer tracks the position of unique elements, fast pointer scans through the array.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Symmetric Tree',
    description: `<p>Given the root of a binary tree, check whether it is a mirror of itself (i.e., symmetric around its center).</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [1,2,2,3,4,4,3]</code></p>
<p><strong>Output:</strong> <code>true</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [1,2,2,null,3,null,3]</code></p>
<p><strong>Output:</strong> <code>false</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      'The number of nodes in the tree is in the range [1, 1000].\n-100 <= Node.val <= 100',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'binary-tree', 'recursion'],
    testcases: [
      {
        input: '{"root": [1,2,2,3,4,4,3]}',
        output: 'true',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": [1,2,2,null,3,null,3]}',
        output: 'false',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": [1]}',
        output: 'true',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Symmetric Tree Solution',
      description: 'Recursive comparison of left and right subtrees',
      videoUrl: 'https://www.youtube.com/watch?v=Mao9uzxwvmc',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Recursive Approach',
          description: 'Compare left and right subtrees recursively',
          sourceCode: `function isSymmetric(root: TreeNode | null): boolean {
    if (!root) return true;
    
    function isMirror(left: TreeNode | null, right: TreeNode | null): boolean {
        if (!left && !right) return true;
        if (!left || !right) return false;
        
        return left.val === right.val &&
               isMirror(left.left, right.right) &&
               isMirror(left.right, right.left);
    }
    
    return isMirror(root.left, root.right);
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(n)',
          explanation:
            'Recursively check if left subtree is mirror of right subtree by comparing corresponding nodes.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Path Sum',
    description: `<p>Given the root of a binary tree and an integer <code>targetSum</code>, return <code>true</code> if the tree has a <strong>root-to-leaf</strong> path such that adding up all the values along the path equals <code>targetSum</code>.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [5,4,8,11,null,13,4,7,2,null,null,null,1], targetSum = 22</code></p>
<p><strong>Output:</strong> <code>true</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [1,2,3], targetSum = 5</code></p>
<p><strong>Output:</strong> <code>false</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      'The number of nodes in the tree is in the range [0, 5000].\n-1000 <= Node.val <= 1000\n-1000 <= targetSum <= 1000',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'binary-tree', 'depth-first-search'],
    testcases: [
      {
        input: '{"root": [5,4,8,11,null,13,4,7,2,null,null,null,1], "targetSum": 22}',
        output: 'true',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": [1,2,3], "targetSum": 5}',
        output: 'false',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": [], "targetSum": 0}',
        output: 'false',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Path Sum Solution',
      description: 'DFS traversal with sum tracking',
      videoUrl: 'https://www.youtube.com/watch?v=LSKQyOz_P8I',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'DFS Approach',
          description: 'Depth-first search with recursive sum tracking',
          sourceCode: `function hasPathSum(root: TreeNode | null, targetSum: number): boolean {
    if (!root) return false;
    
    if (!root.left && !root.right) {
        return root.val === targetSum;
    }
    
    return hasPathSum(root.left, targetSum - root.val) ||
           hasPathSum(root.right, targetSum - root.val);
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(h)',
          explanation:
            'Recursively check if there is a path from root to leaf that sums to targetSum.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Same Tree',
    description: `<p>Given the roots of two binary trees <code>p</code> and <code>q</code>, write a function to check if they are the same or not.</p>
<p>Two binary trees are considered the same if they are structurally identical, and the nodes have the same value.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>p = [1,2,3], q = [1,2,3]</code></p>
<p><strong>Output:</strong> <code>true</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>p = [1,2], q = [1,null,2]</code></p>
<p><strong>Output:</strong> <code>false</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      'The number of nodes in both trees is in the range [0, 100].\n-10^4 <= Node.val <= 10^4',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'binary-tree', 'depth-first-search'],
    testcases: [
      {
        input: '{"p": [1,2,3], "q": [1,2,3]}',
        output: 'true',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"p": [1,2], "q": [1,null,2]}',
        output: 'false',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"p": [], "q": []}',
        output: 'true',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Same Tree Solution',
      description: 'Recursive comparison of both trees',
      videoUrl: 'https://www.youtube.com/watch?v=vRbbcKXCxOw',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Recursive Approach',
          description: 'Compare nodes recursively',
          sourceCode: `function isSameTree(p: TreeNode | null, q: TreeNode | null): boolean {
    if (!p && !q) return true;
    if (!p || !q) return false;
    
    return p.val === q.val &&
           isSameTree(p.left, q.left) &&
           isSameTree(p.right, q.right);
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(h)',
          explanation: 'Recursively compare corresponding nodes in both trees.',
          order: 1,
        },
      ],
    },
  },
  {
    title: 'Maximum Depth of Binary Tree',
    description: `<p>Given the root of a binary tree, return <em>its maximum depth</em>.</p>
<p>A binary tree's <strong>maximum depth</strong> is the number of nodes along the longest path from the root node down to the farthest leaf node.</p>
<h3>Example 1:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [3,9,20,null,null,15,7]</code></p>
<p><strong>Output:</strong> <code>3</code></p>
</div>
<h3>Example 2:</h3>
<div class="example-block">
<p><strong>Input:</strong> <code>root = [1,null,2]</code></p>
<p><strong>Output:</strong> <code>2</code></p>
</div>`,
    difficulty: 'easy',
    constraint:
      'The number of nodes in the tree is in the range [0, 10^4].\n-100 <= Node.val <= 100',
    visibility: ProblemVisibility.PUBLIC,
    tags: ['data-structures', 'binary-tree', 'depth-first-search'],
    testcases: [
      {
        input: '{"root": [3,9,20,null,null,15,7]}',
        output: '3',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": [1,null,2]}',
        output: '2',
        isPublic: true,
        point: 10,
      },
      {
        input: '{"root": []}',
        output: '0',
        isPublic: false,
        point: 10,
      },
    ],
    solution: {
      title: 'Maximum Depth of Binary Tree Solution',
      description: 'Recursive DFS to find maximum depth',
      videoUrl: 'https://www.youtube.com/watch?v=hTM3phVI6YQ',
      imageUrl: '',
      isVisible: true,
      solutionApproaches: [
        {
          title: 'Recursive DFS',
          description: 'Find maximum depth recursively',
          sourceCode: `function maxDepth(root: TreeNode | null): number {
    if (!root) return 0;
    
    const leftDepth = maxDepth(root.left);
    const rightDepth = maxDepth(root.right);
    
    return Math.max(leftDepth, rightDepth) + 1;
}`,
          language: 'typescript',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(h)',
          explanation:
            'Recursively find the maximum depth of left and right subtrees, then add 1 for the current node.',
          order: 1,
        },
      ],
    },
  },
];

async function createChallenges(topicId: string) {
  // Connect to database first
  try {
    await DatabaseService.connect();
    console.log('✅ Database connected successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to connect to database:', error.message);
    process.exit(1);
  }

  const challengeService = new ChallengeService();
  let successCount = 0;
  let failCount = 0;

  console.log(`🚀 Starting to create ${challenges.length} challenges for topic: ${topicId}\n`);

  for (let i = 0; i < challenges.length; i++) {
    const challenge = challenges[i];
    if (!challenge) {
      console.error(`❌ Challenge at index ${i} is undefined`);
      failCount++;
      continue;
    }

    try {
      console.log(`[${i + 1}/${challenges.length}] Creating: ${challenge.title}...`);

      const result = await challengeService.createChallenge({
        ...challenge,
        topicid: topicId,
      });

      console.log(`✅ Successfully created: ${challenge.title}`);
      console.log(`   Problem ID: ${result.problem.id}\n`);
      successCount++;
    } catch (error: any) {
      console.error(`❌ Failed to create: ${challenge.title}`);
      console.error(`   Error: ${error.message}\n`);
      failCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📝 Total: ${challenges.length}`);
}

// Main execution
const topicId = process.argv[2];

if (!topicId) {
  console.error('❌ Error: Topic ID is required');
  console.log('Usage: npx ts-node scripts/create-challenges.ts <topic-id>');
  console.log('   or: npm run create:challenges <topic-id>');
  process.exit(1);
}

// Validate UUID format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(topicId)) {
  console.error('❌ Error: Invalid UUID format for topic ID');
  process.exit(1);
}

createChallenges(topicId)
  .then(async () => {
    console.log('\n✨ Script completed!');
    // Close database connection
    try {
      await DatabaseService.disconnect();
    } catch (error) {
      // Ignore disconnect errors
    }
    process.exit(0);
  })
  .catch(async error => {
    console.error('\n❌ Script failed:', error);
    // Close database connection
    try {
      await DatabaseService.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    process.exit(1);
  });
