jest.mock('../../../apps/sandbox/src/sandbox.service', () => ({
  sandboxService: {
    executeCode: jest.fn(),
  },
}));

import { executeCode } from '../../../apps/sandbox/src/grpc/server';
import { sandboxService } from '../../../apps/sandbox/src/sandbox.service';

describe('sandbox gRPC ExecuteCode handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes requests without execution_mode and forwards wrapper payload to sandboxService', async () => {
    (sandboxService.executeCode as jest.Mock).mockResolvedValue({
      success: true,
      result: {
        summary: {
          passed: 1,
          total: 1,
          successRate: '100.00',
          status: 'ACCEPTED',
        },
        results: [
          {
            testcaseId: 'tc-1',
            isPassed: true,
            executionTime: 7,
            actualOutput: '[0,1]',
            error: null,
            stderr: '',
          },
        ],
      },
    });

    const callback = jest.fn();
    await executeCode(
      {
        request: {
          submission_id: 'submission-1',
          source_code: 'print(1)',
          language: 'python',
          time_limit_ms: 1000,
          memory_limit_kb: 131072,
          test_cases: [
            {
              id: 'tc-1',
              input: '{}',
              expected_output: '[0,1]',
            },
          ],
        },
      } as any,
      callback as any
    );

    expect(sandboxService.executeCode).toHaveBeenCalledWith({
      code: 'print(1)',
      language: 'python',
      timeLimit: 1000,
      memoryLimit: '128m',
      testcases: [
        {
          id: 'tc-1',
          input: '{}',
          output: '[0,1]',
          point: 1,
        },
      ],
    });

    expect(callback).toHaveBeenCalledWith(null, {
      submission_id: 'submission-1',
      overall_status: 'ACCEPTED',
      compile_error: '',
      results: [
        {
          test_case_id: 'tc-1',
          status: 'ACCEPTED',
          time_taken_ms: 7,
          memory_used_kb: 0,
          actual_output: '[0,1]',
          error_message: '',
        },
      ],
    });
  });
});