import { logger } from '@backend/shared/utils';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { sandboxService } from '../sandbox.service';

// ─────────────────────────────────────────────────────────────────────────────
// Load .proto from packages/shared/proto/sandbox.proto
// Using path.resolve from __dirname to be cwd-independent.
// ISOLATION RULE: This file must NOT import anything from @backend/api/*
// ─────────────────────────────────────────────────────────────────────────────
const PROTO_PATH = path.resolve(__dirname, '../../../../packages/shared/proto/sandbox.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const judgeProto = grpc.loadPackageDefinition(packageDefinition) as any;

// ─────────────────────────────────────────────────────────────────────────────
// gRPC Handler: ExecuteCode
// Maps the proto ExecutionRequest → sandboxService.executeCode → ExecutionResponse
// ─────────────────────────────────────────────────────────────────────────────
async function executeCode(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
): Promise<void> {
  const req = call.request;

  logger.info(`[gRPC] ExecuteCode received — submission_id: ${req.submission_id}`);

  try {
    // Map proto TestCase[] → internal ExecutionConfig format
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
      // Compile error or execution error
      const response = {
        submission_id: req.submission_id,
        overall_status: 'COMPILE_ERROR',
        compile_error: result.error || '',
        results: [],
      };
      return callback(null, response);
    }

    // Map internal results → proto TestCaseResult[]
    const protoResults = (result.result?.results || []).map((r: any) => ({
      test_case_id: r.testcaseId || '',
      status: r.isPassed
        ? 'ACCEPTED'
        : r.error?.includes('time')
          ? 'TIME_LIMIT_EXCEEDED'
          : 'WRONG_ANSWER',
      time_taken_ms: r.executionTime || 0,
      memory_used_kb: 0,
      actual_output: r.actualOutput || '',
      error_message: r.error || '',
    }));

    const allPassed = protoResults.every((r: any) => r.status === 'ACCEPTED');

    const response = {
      submission_id: req.submission_id,
      overall_status: allPassed ? 'ACCEPTED' : 'WRONG_ANSWER',
      compile_error: '',
      results: protoResults,
    };

    callback(null, response);
  } catch (err: any) {
    logger.error('[gRPC] ExecuteCode error:', err.message);
    callback({
      code: grpc.status.INTERNAL,
      message: err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create and start gRPC server
// ─────────────────────────────────────────────────────────────────────────────
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
