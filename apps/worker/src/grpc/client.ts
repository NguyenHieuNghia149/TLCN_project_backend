import { logger } from '@backend/shared/utils';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

const PROTO_PATH = path.resolve(__dirname, '../../../../packages/shared/proto/sandbox.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const judgeProto = grpc.loadPackageDefinition(packageDefinition) as any;

export interface GrpcTestCase {
  id: string;
  input: string;
  expected_output: string;
}

export interface GrpcExecutionRequest {
  submission_id: string;
  source_code: string;
  language: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  test_cases: GrpcTestCase[];
  execution_mode?: 'wrapper' | 'legacy';
}

export interface GrpcTestCaseResult {
  test_case_id: string;
  status: string;
  time_taken_ms: number;
  memory_used_kb: number;
  actual_output: string;
  error_message: string;
}

export interface GrpcExecutionResponse {
  submission_id: string;
  overall_status: string;
  compile_error: string;
  results: GrpcTestCaseResult[];
}

export class SandboxGrpcClient {
  private stub: any;
  private readonly sandboxAddress: string;

  constructor() {
    this.sandboxAddress = process.env.SANDBOX_GRPC_URL || 'localhost:50051';
    this.stub = new judgeProto.judge.SandboxService(
      this.sandboxAddress,
      grpc.credentials.createInsecure()
    );
    logger.info(`[gRPC Client] Connected to sandbox at ${this.sandboxAddress}`);
  }

  executeCode(request: GrpcExecutionRequest): Promise<GrpcExecutionResponse> {
    return new Promise((resolve, reject) => {
      this.stub.ExecuteCode(
        request,
        (err: grpc.ServiceError | null, response: GrpcExecutionResponse) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  close(): void {
    grpc.closeClient(this.stub);
  }
}

export const sandboxGrpcClient = new SandboxGrpcClient();
