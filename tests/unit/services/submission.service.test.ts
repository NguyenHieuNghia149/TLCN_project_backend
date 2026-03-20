const mockAddJob = jest.fn();
const mockGetQueueLength = jest.fn();
const mockGetQueueStatus = jest.fn();
const mockPublish = jest.fn();
const mockGetJudgeQueueService = jest.fn(() => ({
  addJob: mockAddJob,
  getQueueLength: mockGetQueueLength,
  getQueueStatus: mockGetQueueStatus,
  publish: mockPublish,
}));

jest.mock('@backend/shared/runtime/judge-queue', () => ({
  getJudgeQueueService: mockGetJudgeQueueService,
}));

import {
  createSubmissionService,
  SubmissionService,
} from '../../../apps/api/src/services/submission.service';
import type { QueueJob } from '@backend/shared/runtime/judge-queue';
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a submission service without a module-level singleton export', () => {
    expect(createSubmissionService()).toBeInstanceOf(SubmissionService);
  });

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
    ) as QueueJob;

    const firstTestcase = job.testcases[0]!;

    expect('executionMode' in job).toBe(false);
    expect(firstTestcase).toEqual({
      id: 'testcase-1',
      inputJson: { nums: [2, 7, 11, 15], target: 9 },
      outputJson: [0, 1],
      point: 10,
      isPublic: true,
    });
    expect('input' in firstTestcase).toBe(false);
    expect('output' in firstTestcase).toBe(false);
  });

  it('derives submission result display from JSON even when cached text is stale', () => {
    const service = new SubmissionService();
    const status = (service as any).mapSubmissionStatus(
      {
        id: 'submission-1',
        userId: 'user-1',
        problemId: 'problem-1',
        language: 'python',
        sourceCode: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]',
        status: 'ACCEPTED',
        submittedAt: new Date(),
      },
      [
        {
          testcaseId: 'testcase-1',
          actualOutput: '[0,1]',
          isPassed: true,
          executionTime: 12,
          memoryUse: 128,
          error: null,
        },
      ],
      [
        {
          id: 'testcase-1',
          inputJson: { nums: [2, 7, 11, 15], target: 9 },
          outputJson: [0, 1],
          isPublic: true,
          point: 10,
        },
      ],
      { functionSignature: signature }
    );

    expect(status.result?.results[0]).toMatchObject({
      input: 'nums: [2, 7, 11, 15]\ntarget: 9',
      expected: '[0,1]',
      actual: '[0,1]',
      ok: true,
    });
  });

  it('uses the lazy queue accessor instead of a module-level singleton', () => {
    const service = new SubmissionService();

    expect((service as any).getQueueService()).toEqual({
      addJob: mockAddJob,
      getQueueLength: mockGetQueueLength,
      getQueueStatus: mockGetQueueStatus,
      publish: mockPublish,
    });
    expect(mockGetJudgeQueueService).toHaveBeenCalledTimes(1);
  });
});
