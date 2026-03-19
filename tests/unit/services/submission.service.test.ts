jest.mock('../../../apps/api/src/services/queue.service', () => ({
  queueService: {
    addJob: jest.fn(),
    getQueueLength: jest.fn(),
    getQueueStatus: jest.fn(),
    publish: jest.fn(),
  },
}));

import { SubmissionService } from '../../../apps/api/src/services/submission.service';
import { FunctionSignature } from '@backend/shared/types';

describe('SubmissionService JSON-first queue payload', () => {
  const signature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  it('omits cached text fields from queue jobs', () => {
    const service = new SubmissionService();
    const job = (service as any).prepareQueueJob(
      {
        id: 'submission-1',
        userId: 'user-1',
        problemId: 'problem-1',
        sourceCode: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]',
        language: 'python',
      },
      {
        functionSignature: signature,
        timeLimit: 1000,
        memoryLimit: '128m',
      },
      [
        {
          id: 'testcase-1',
          input: 'stale input',
          output: 'stale output',
          inputJson: { nums: [2, 7, 11, 15], target: 9 },
          outputJson: [0, 1],
          point: 10,
          isPublic: true,
        },
      ]
    );

    expect(job.executionMode).toBe('wrapper');
    expect(job.testcases[0]).toEqual({
      id: 'testcase-1',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      point: 10,
      isPublic: true,
    });
    expect('input' in job.testcases[0]).toBe(false);
    expect('output' in job.testcases[0]).toBe(false);
  });
});