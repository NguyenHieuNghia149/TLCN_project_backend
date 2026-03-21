import {
  createSubmissionService,
  ISubmissionQueueService,
  SubmissionService,
} from '../../../apps/api/src/services/submission.service';
import { SubmissionRepository } from '../../../apps/api/src/repositories/submission.repository';
import { ResultSubmissionRepository } from '../../../apps/api/src/repositories/result-submission.repository';
import { TestcaseRepository } from '../../../apps/api/src/repositories/testcase.repository';
import { ProblemRepository } from '../../../apps/api/src/repositories/problem.repository';
import { UserRepository } from '../../../apps/api/src/repositories/user.repository';
import { ExamParticipationRepository } from '../../../apps/api/src/repositories/examParticipation.repository';
import { ExamRepository } from '../../../apps/api/src/repositories/exam.repository';
import type { QueueJob } from '@backend/shared/runtime/judge-queue';
import { FunctionSignature } from '@backend/shared/types';

/** Builds a dependency bag for SubmissionService tests with optional overrides. */
function createSubmissionDependencies(overrides: Partial<any> = {}) {
  return {
    submissionRepository: {} as any,
    resultSubmissionRepository: {} as any,
    testcaseRepository: {} as any,
    problemRepository: {} as any,
    userRepository: {} as any,
    examParticipationRepository: {} as any,
    examRepository: {} as any,
    getQueueService: () => ({
      addJob: jest.fn(),
      getQueueLength: jest.fn().mockResolvedValue(0),
      getQueueStatus: jest.fn().mockResolvedValue({ length: 0, isHealthy: true }),
    }),
    ...overrides,
  };
}

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
    const service = createSubmissionService();

    expect(service).toBeInstanceOf(SubmissionService);
    expect((service as any).submissionRepository).toBeInstanceOf(SubmissionRepository);
    expect((service as any).resultSubmissionRepository).toBeInstanceOf(ResultSubmissionRepository);
    expect((service as any).testcaseRepository).toBeInstanceOf(TestcaseRepository);
    expect((service as any).problemRepository).toBeInstanceOf(ProblemRepository);
    expect((service as any).userRepository).toBeInstanceOf(UserRepository);
    expect((service as any).examParticipationRepository).toBeInstanceOf(ExamParticipationRepository);
    expect((service as any).examRepository).toBeInstanceOf(ExamRepository);
    expect(typeof (service as any).queueServiceFactory).toBe('function');
  });

  it('omits cached text fields from queue jobs', () => {
    const service = new SubmissionService(createSubmissionDependencies());
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
    const service = new SubmissionService(createSubmissionDependencies());
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

  it('uses the injected queue accessor instead of a module-level singleton', () => {
    const queueService: ISubmissionQueueService = {
      addJob: jest.fn(),
      getQueueLength: jest.fn().mockResolvedValue(3),
      getQueueStatus: jest.fn().mockResolvedValue({ length: 3, isHealthy: true }),
    };
    const getQueueService = jest.fn(() => queueService);
    const service = new SubmissionService(
      createSubmissionDependencies({ getQueueService }),
    );

    expect((service as any).getQueueService()).toBe(queueService);
    expect(getQueueService).toHaveBeenCalledTimes(1);
  });
});
