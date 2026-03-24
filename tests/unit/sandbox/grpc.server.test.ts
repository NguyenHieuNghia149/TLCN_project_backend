import { createExecuteCodeHandler } from '../../../apps/sandbox/src/grpc/server';
import { ISandboxService } from '../../../apps/sandbox/src/sandbox.service';

describe('sandbox gRPC ExecuteCode handler', () => {
  const sandboxService: jest.Mocked<ISandboxService> = {
    executeCode: jest.fn(),
    getStatus: jest.fn(),
    healthCheck: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes requests without execution_mode and forwards wrapper payload to sandboxService', async () => {
    sandboxService.executeCode.mockResolvedValue({
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
            input: '{}',
            isPassed: true,
            executionTime: 7,
            actualOutput: '[0,1]',
            error: null,
            stderr: '',
          },
        ],
        processingTime: 1,
      },
    });

    const callback = jest.fn();
    const executeCode = createExecuteCodeHandler(sandboxService);

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
  it('classifies compiler stderr as COMPILATION_ERROR instead of RUNTIME_ERROR', async () => {
    const compileError =
      "wrapper.cpp: In function 'int main()':\n" +
      "wrapper.cpp:33:35: error: binding reference of type 'std::vector<int>&' to 'const std::vector<int>' discards qualifiers\n" +
      "solution.cpp:7:37: note: initializing argument 1 of 'std::vector<int> Solution::twoSum(std::vector<int>&, int)'";

    sandboxService.executeCode.mockResolvedValue({
      success: true,
      result: {
        summary: {
          passed: 0,
          total: 1,
          successRate: '0.00',
          status: '',
        },
        results: [
          {
            testcaseId: 'tc-1',
            input: '{}',
            isPassed: false,
            executionTime: 0,
            actualOutput: '',
            error: compileError,
            stderr: '',
          },
        ],
        processingTime: 1,
      },
    });

    const callback = jest.fn();
    const executeCode = createExecuteCodeHandler(sandboxService);

    await executeCode(
      {
        request: {
          submission_id: 'submission-compile-error',
          source_code: 'class Solution {}',
          language: 'cpp',
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

    expect(callback).toHaveBeenCalledWith(null, {
      submission_id: 'submission-compile-error',
      overall_status: 'COMPILATION_ERROR',
      compile_error: compileError,
      results: [
        {
          test_case_id: 'tc-1',
          status: 'COMPILATION_ERROR',
          time_taken_ms: 0,
          memory_used_kb: 0,
          actual_output: '',
          error_message: compileError,
        },
      ],
    });
  });
});


