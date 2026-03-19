import { logger } from '@backend/shared/utils';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { sandboxService } from '../sandbox.service';

const PROTO_PATH = path.resolve(__dirname, '../../../../packages/shared/proto/sandbox.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const judgeProto = grpc.loadPackageDefinition(packageDefinition) as any;

export function validateWrapperExecutionMode(value: unknown): string | null {
  if (value === undefined || value === '' || value === 'wrapper') {
    return null;
  }

  return `execution_mode must be 'wrapper' or unset; got: ${String(value)}`;
}

function inferTestCaseStatus(result: any): string {
  if (result.isPassed) {
    return 'ACCEPTED';
  }

  const normalized = `${result.error || ''}\n${result.stderr || ''}`.toLowerCase();

  if (normalized.includes('time limit exceeded') || normalized.includes('timeout')) {
    return 'TIME_LIMIT_EXCEEDED';
  }

  if (normalized.includes('memory limit exceeded') || normalized.includes('out of memory')) {
    return 'MEMORY_LIMIT_EXCEEDED';
  }

  if (normalized.includes('compilation') || normalized.includes('compile')) {
    return 'COMPILATION_ERROR';
  }

  if (
    normalized.includes('runtime') ||
    normalized.includes('process exited with code') ||
    normalized.includes('wrapper envelope missing or malformed') ||
    normalized.includes('invalid envelope')
  ) {
    return 'RUNTIME_ERROR';
  }

  return 'WRONG_ANSWER';
}

function deriveOverallStatus(summaryStatus: string | undefined, results: any[]): string {
  if (summaryStatus && summaryStatus.length > 0) {
    return summaryStatus;
  }

  if (results.length === 0) {
    return 'SYSTEM_ERROR';
  }

  if (results.every(result => result.status === 'ACCEPTED')) {
    return 'ACCEPTED';
  }

  const priorities = [
    'COMPILATION_ERROR',
    'TIME_LIMIT_EXCEEDED',
    'MEMORY_LIMIT_EXCEEDED',
    'RUNTIME_ERROR',
    'WRONG_ANSWER',
  ];

  for (const status of priorities) {
    if (results.some(result => result.status === status)) {
      return status;
    }
  }

  return 'WRONG_ANSWER';
}

async function executeCode(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
): Promise<void> {
  const req = call.request;

  logger.info(`[gRPC] ExecuteCode received - submission_id: ${req.submission_id}`);

  const executionModeError = validateWrapperExecutionMode(req.execution_mode);
  if (executionModeError) {
    logger.error('[gRPC] Invalid execution_mode received', {
      submissionId: req.submission_id,
      executionMode: req.execution_mode,
    });
    callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: executionModeError,
    });
    return;
  }

  try {
    const testcases = (req.test_cases || []).map((tc: any) => ({
      id: tc.id,
      input: tc.input,
      output: tc.expected_output,
      point: 1,
    }));

    const result = await sandboxService.executeCode({
      code: req.source_code,
      language: req.language,
      timeLimit: req.time_limit_ms,
      memoryLimit: `${Math.floor(req.memory_limit_kb / 1024)}m`,
      testcases,
    });

    if (!result.success) {
      callback(null, {
        submission_id: req.submission_id,
        overall_status: 'SYSTEM_ERROR',
        compile_error: result.error || '',
        results: [],
      });
      return;
    }

    const protoResults = (result.result?.results || []).map((r: any) => ({
      test_case_id: r.testcaseId || '',
      status: inferTestCaseStatus(r),
      time_taken_ms: Math.round(r.executionTime || 0),
      memory_used_kb: 0,
      actual_output: r.actualOutput || '',
      error_message: r.error || '',
    }));

    const overallStatus = deriveOverallStatus(result.result?.summary?.status, protoResults);
    const compileError =
      overallStatus === 'COMPILATION_ERROR'
        ? protoResults.find((row: any) => row.error_message)?.error_message || ''
        : '';

    callback(null, {
      submission_id: req.submission_id,
      overall_status: overallStatus,
      compile_error: compileError,
      results: protoResults,
    });
  } catch (err: any) {
    logger.error('[gRPC] ExecuteCode error:', err.message);
    callback({
      code: grpc.status.INTERNAL,
      message: err.message,
    });
  }
}

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server();

  server.addService(judgeProto.judge.SandboxService.service, {
    ExecuteCode: executeCode,
  });

  return server;
}

export function startGrpcServer(port: number = 50051): grpc.Server {
  const server = createGrpcServer();

  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      logger.error('[gRPC] Failed to bind server:', err.message);
      process.exit(1);
    }
    logger.info(`[gRPC] SandboxService listening on port ${boundPort}`);
  });

  return server;
}