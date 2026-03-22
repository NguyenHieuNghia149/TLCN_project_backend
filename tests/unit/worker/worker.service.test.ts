const mockPublish = jest.fn();
const mockGetJudgeQueueService = jest.fn(() => ({
  publish: mockPublish,
}));

jest.mock('@backend/shared/runtime/judge-queue', () => ({
  getJudgeQueueService: mockGetJudgeQueueService,
}));

jest.mock('@backend/shared/runtime/submission-finalization', () => ({
  finalizeSubmissionResult: jest.fn(),
}));

jest.mock('../../../apps/worker/src/grpc/circuit-breaker', () => ({
  createSandboxBreaker: jest.fn(() => ({
    fire: jest.fn(),
    opened: false,
  })),
}));

import { WorkerService } from '../../../apps/worker/src/services/worker.service';
import type { QueueJob } from '@backend/shared/runtime/judge-queue';
import type { ISandboxGrpcClient } from '../../../apps/worker/src/grpc/client';
import { buildFunctionInputDisplayValue, canonicalizeStructuredValue } from '@backend/shared/utils';
import { FunctionSignature } from '@backend/shared/types';

/** Creates a minimal BullMQ worker double for lifecycle tests. */
function createFakeBullWorker() {
  const fakeWorker = {
    on: jest.fn().mockReturnThis(),
    close: jest.fn(async () => undefined),
  };

  return fakeWorker;
}

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
  const mockSandboxClient: jest.Mocked<ISandboxGrpcClient> = {
    executeCode: jest.fn(),
    close: jest.fn(),
  };
  const mockCreateBreaker = jest.fn(() => ({
    fire: jest.fn(),
    opened: false,
  }));

  const job: QueueJob = {
    submissionId: 'submission-1',
    userId: 'user-1',
    problemId: 'problem-1',
    code: 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]',
    language: 'python',
    functionSignature: signature,
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds sandbox stdin and expected output directly from structured JSON', () => {
    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker: jest.fn(),
      createBreaker: mockCreateBreaker as any,
    });
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
    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker: jest.fn(),
      createBreaker: mockCreateBreaker as any,
    });
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
    expect(remapped.results[0].expectedOutput).toBe(canonicalizeStructuredValue(testcaseOutput));
  });

  it('omits execution_mode in worker health probe requests', async () => {
    mockSandboxClient.executeCode.mockResolvedValue({
      submission_id: 'health-probe',
      overall_status: 'ACCEPTED',
      compile_error: '',
      results: [],
    });

    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker: jest.fn(),
      createBreaker: mockCreateBreaker as any,
    });
    const ok = await (service as any).testSandboxService();

    expect(ok).toBe(true);
    expect(mockSandboxClient.executeCode).toHaveBeenCalledTimes(1);
    const request = mockSandboxClient.executeCode.mock.calls[0]![0];
    expect((request as any).execution_mode).toBeUndefined();
  });

  it('uses the lazy queue accessor instead of a module-level singleton', () => {
    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker: jest.fn(),
      createBreaker: mockCreateBreaker as any,
    });

    expect((service as any).getQueueService()).toEqual({ publish: mockPublish });
    expect(mockGetJudgeQueueService).toHaveBeenCalledTimes(1);
  });

  it('creates the BullMQ worker lazily and makes start idempotent', async () => {
    mockSandboxClient.executeCode.mockResolvedValue({
      submission_id: 'health-probe',
      overall_status: 'ACCEPTED',
      compile_error: '',
      results: [],
    });
    const fakeWorker = createFakeBullWorker();
    const createBullWorker = jest.fn(() => fakeWorker as any);
    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker,
      createBreaker: mockCreateBreaker as any,
    });

    expect(createBullWorker).not.toHaveBeenCalled();

    await service.start();
    await service.start();

    expect(createBullWorker).toHaveBeenCalledTimes(1);
    expect(mockCreateBreaker).toHaveBeenCalledTimes(1);
    expect(mockCreateBreaker).toHaveBeenCalledWith(fakeWorker, mockSandboxClient);
    expect(mockSandboxClient.executeCode).toHaveBeenCalledTimes(1);
    expect(fakeWorker.on).toHaveBeenCalledTimes(2);
  });

  it('stops the worker and closes the sandbox client after start', async () => {
    mockSandboxClient.executeCode.mockResolvedValue({
      submission_id: 'health-probe',
      overall_status: 'ACCEPTED',
      compile_error: '',
      results: [],
    });
    const fakeWorker = createFakeBullWorker();
    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker: jest.fn(() => fakeWorker as any),
      createBreaker: mockCreateBreaker as any,
    });

    await service.start();
    await service.stop();

    expect(fakeWorker.close).toHaveBeenCalledTimes(1);
    expect(mockSandboxClient.close).toHaveBeenCalledTimes(1);
  });

  it('stops safely before start without throwing', async () => {
    const service = new WorkerService({
      sandboxClient: mockSandboxClient,
      createBullWorker: jest.fn(),
      createBreaker: mockCreateBreaker as any,
    });

    await expect(service.stop()).resolves.toBeUndefined();
    expect(mockSandboxClient.close).toHaveBeenCalledTimes(1);
  });
});

