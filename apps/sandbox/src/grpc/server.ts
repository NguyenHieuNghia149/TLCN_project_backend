import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '@backend/shared/utils';
import { ISandboxService } from '../sandbox.service';

const PROTO_PATH = path.resolve(__dirname, '../../../../packages/shared/proto/sandbox.proto');

let cachedJudgeProto: any | null = null;

function getJudgeProto(): any {
  if (cachedJudgeProto) {
    return cachedJudgeProto;
  }

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  cachedJudgeProto = grpc.loadPackageDefinition(packageDefinition) as any;
  return cachedJudgeProto;
}


function looksLikeCompilationFailure(normalized: string): boolean {
  const sourceCoordinatePattern = /(?:^|\n)(?:wrapper|solution|main)\.(?:c|cc|cpp|cxx|java|kt|py):\d+/;

  return (
    normalized.includes('compilation') ||
    normalized.includes('compile') ||
    normalized.includes('syntaxerror:') ||
    sourceCoordinatePattern.test(normalized) ||
    (normalized.includes('error:') && (normalized.includes('note:') || normalized.includes('in function')))
  );
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

  if (looksLikeCompilationFailure(normalized)) {
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

export function createExecuteCodeHandler(
  sandboxService: ISandboxService
): grpc.handleUnaryCall<any, any> {
  return async (call, callback) => {
    const req = call.request;

    logger.info(`[gRPC] ExecuteCode received - submission_id: ${req.submission_id}`);

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
  };
}

export function createGrpcServer(sandboxService: ISandboxService): grpc.Server {
  const server = new grpc.Server();
  const judgeProto = getJudgeProto();

  server.addService(judgeProto.judge.SandboxService.service, {
    ExecuteCode: createExecuteCodeHandler(sandboxService),
  });

  return server;
}

export function startGrpcServer(
  sandboxService: ISandboxService,
  port: number = 50051
): Promise<grpc.Server> {
  const server = createGrpcServer(sandboxService);

  return new Promise((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          reject(err);
          return;
        }

        server.start();
        logger.info(`[gRPC] SandboxService listening on port ${boundPort}`);
        resolve(server);
      }
    );
  });
}

