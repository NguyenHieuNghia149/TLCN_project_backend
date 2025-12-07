#!/usr/bin/env ts-node

import { config } from 'dotenv';
import { DatabaseService } from '../src/database/connection';
import { ExamService } from '../src/services/exam.service';
import { ProblemInput } from '../src/validations/problem.validation';
import { CreateExamInput, ExamChallengeInput } from '../src/validations/exam.validation';
import { ProblemVisibility } from '../src/enums/problemVisibility.enum';

// Load environment variables
config();

/**
 * Sample "new" challenges data (tương tự scripts/create-challenges.ts).
 * Có thể sửa/extend list này tùy ý.
 */
const newChallenges: ProblemInput[] = [
  {
    title: 'Binary Tree Inorder Traversal',
    description: `<p>Given the root of a binary tree, return <em>the inorder traversal of its nodes' values</em>.</p>`,
    difficulty: 'easy',
    constraint:
      'The number of nodes in the tree is in the range [0, 100].\n-100 <= Node.val <= 100',
    visibility: ProblemVisibility.EXAM_ONLY,
    tags: ['binary-tree', 'stack'],
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
      description: 'Recursive approach',
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
    title: 'Climbing Stairs',
    description: `<p>You are climbing a staircase. It takes <code>n</code> steps to reach the top.</p>`,
    difficulty: 'easy',
    constraint: '1 <= n <= 45',
    visibility: ProblemVisibility.EXAM_ONLY,
    tags: ['math'],
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
];

/**
 * Danh sách ID challenge (problem) đã có sẵn trong DB.
 * - Điền ID problem thật của bạn vào mảng này nếu muốn reuse.
 * - Có thể để trống nếu chỉ muốn tạo challenge mới.
 */
const existingChallengeIds: string[] = [
  '0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb',
  '055620b2-4347-422a-961c-66fd8cba0a37',
];

function buildExamInput(): CreateExamInput {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const challenges: ExamChallengeInput[] = [
    // Existing challenges (link với problem đã có trong DB)
    ...existingChallengeIds.map((id, index) => ({
      type: 'existing' as const,
      challengeId: id,
      orderIndex: index,
    })),

    // New challenges (tạo mới giống như script create-challenges.ts)
    ...newChallenges.map((challenge, index) => ({
      type: 'new' as const,
      challenge,
      orderIndex: existingChallengeIds.length + index,
    })),
  ];

  const examInput: CreateExamInput = {
    title: 'Sample Exam with Mixed Challenges',
    password: 'exam123',
    duration: 60, // minutes
    startDate: now.toISOString(),
    endDate: twoHoursLater.toISOString(),
    isVisible: true,
    maxAttempts: 1,
    challenges,
  };

  return examInput;
}

async function createExam() {
  // 1. Kết nối DB
  try {
    await DatabaseService.connect();
    console.log('✅ Database connected successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to connect to database:', error?.message || error);
    process.exit(1);
  }

  const examService = new ExamService();

  try {
    const examInput = buildExamInput();

    console.log('🚀 Creating exam with the following config:');
    console.log(JSON.stringify({ ...examInput, challenges: undefined }, null, 2));
    console.log(`   Total challenges: ${examInput.challenges.length}`);
    console.log(
      `   Existing challenges: ${existingChallengeIds.length}, New challenges: ${newChallenges.length}\n`
    );

    const result = await examService.createExam(examInput);

    console.log('✅ Exam created successfully!');
    console.log(`   Exam ID: ${result.id}`);
    console.log(`   Title   : ${result.title}`);
    console.log(`   Duration: ${result.duration} minutes`);
    console.log(`   Challenges: ${result.challenges.length}`);
  } catch (error: any) {
    console.error('❌ Failed to create exam');
    console.error('   Error:', error?.message || error);
  } finally {
    try {
      await DatabaseService.disconnect();
    } catch {
      // ignore
    }
  }
}

// Main execution
createExam()
  .then(() => {
    console.log('\n✨ Script completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
