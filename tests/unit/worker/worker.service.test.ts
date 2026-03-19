jest.mock('../../../apps/api/src/services/queue.service', () => ({
  queueService: {
    publish: jest.fn(),
  },
}));

jest.mock('../../../apps/api/src/services/submission.service', () => ({
  submissionService: {
    updateSubmissionResult: jest.fn(),
  },
}));

jest.mock('../../../apps/api/src/services/exam.service', () => ({
  ExamService: jest.fn().mockImplementation(() => ({
    finalizeExpiredParticipations: jest.fn().mockResolvedValue(0),
  })),
}));

jest.mock('../../../apps/worker/src/grpc/client', () => ({
  sandboxGrpcClient: {
    executeCode: jest.fn(),
  },
}));

jest.mock('../../../apps/worker/src/grpc/circuit-breaker', () => ({
  createSandboxBreaker: jest.fn(() => ({
    fire: jest.fn(),
    opened: false,
  })),
}));

import { WorkerService } from '../../../apps/worker/src/worker.service';
import { QueueJob } from '../../../apps/api/src/services/queue.service';
import {
  buildFunctionInputDisplayValue,
  canonicalizeStructuredValue,
} from '@backend/shared/utils';
import { FunctionSignature } from '@backend/shared/types';

describe('WorkerService JSON-first execution payload', () => {
  const signature: FunctionSignature = {
    name: 'twoSum',
    args: [
      { name: 'nums', type: 'array', items: 'integer' },
      { name: 'target', type: 'integer' },
    ],
    returnType: { type: 'array', items: 'integer' },
  };

  const testcaseInput = { nums: [2, 7, 11, 15], target: 9 };
  const testcaseOutput = [0, 1];

  const job: QueueJob = {
    submissionId: 'submission-1',
    userId: 'user-1',
    problemId: 'problem-1',
    code: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]',
    language: 'python',
    functionSignature: signature,
    executionMode: 'wrapper',
    testcases: [
      {
        id: 'testcase-1',
        inputJson: testcaseInput,
        outputJson: testcaseOutput,
        point: 10,
        isPublic: true,
      },
    ],
    timeLimit: 1000,
    memoryLimit: '128m',
    createdAt: new Date().toISOString(),
  };

  it('builds sandbox stdin and expected output directly from structured JSON', () => {
    const service = new WorkerService();
    const payload = (service as any).prepareExecutionPayload(job);

    expect(payload.testcases).toEqual([
      {
        id: 'testcase-1',
        input: JSON.stringify(testcaseInput),
        output: canonicalizeStructuredValue(testcaseOutput),
        point: 10,
      },
    ]);
  });

  it('derives display text from shared helpers instead of cached fields', () => {
    const service = new WorkerService();
    const executionResult = {
      results: [
        {
          testcaseId: 'testcase-1',
          input: 'stale input',
          expectedOutput: 'stale output',
          actualOutput: '[0,1]',
          isPassed: true,
          executionTime: 1,
          memoryUse: 128,
          error: null,
        },
      ],
    };

    const remapped = (service as any).remapExecutionResults(job, executionResult);

    expect(remapped.results[0].input).toBe(
      buildFunctionInputDisplayValue(signature, testcaseInput)
    );
    expect(remapped.results[0].expectedOutput).toBe(
      canonicalizeStructuredValue(testcaseOutput)
    );
  });
});