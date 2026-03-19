import { ChallengeService } from '../../../apps/api/src/services/challenge.service';
import { FunctionSignature } from '@backend/shared/types';

describe('ChallengeService derived testcase display', () => {
  const signature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  it('derives testcase input and output from JSON instead of cached DB text', () => {
    const service = new ChallengeService();
    const response = (service as any).mapToChallengeResponse({
      problem: {
        id: 'problem-1',
        title: 'Two Sum',
        description: 'desc',
        difficult: 'easy',
        constraint: null,
        tags: 'array,hash-table',
        lessonId: null,
        topicId: null,
        isSolved: false,
        isFavorite: false,
        functionSignature: signature,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      testcases: [
        {
          id: 'testcase-1',
          inputJson: { nums: [2, 7, 11, 15], target: 9 },
          outputJson: [0, 1],
          input: 'stale input cache',
          output: 'stale output cache',
          isPublic: true,
          point: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      solution: null,
    });

    expect(response.testcases[0]).toMatchObject({
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      input: 'nums: [2, 7, 11, 15]\ntarget: 9',
      output: '[0,1]',
    });
  });
});