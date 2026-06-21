import { logger } from '@backend/shared/utils';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

const PROTO_PATH = path.resolve(__dirname, '../../../../packages/shared/proto/sandbox.proto');
let judgeProtoCache: any | null = null;

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

export interface ISandboxGrpcClient {
  executeCode(request: GrpcExecutionRequest): Promise<GrpcExecutionResponse>;
  close(): void;
}

interface ISandboxGrpcStub {
  ExecuteCode(
    request: GrpcExecutionRequest,
    callback: (err: grpc.ServiceError | null, response: GrpcExecutionResponse) => void
  ): void;
}

type SandboxGrpcClientDependencies = {
  sandboxAddress: string;
  stub: ISandboxGrpcStub;
};

function getJudgeProto(): any {
  if (judgeProtoCache) {
    return judgeProtoCache;
  }

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  judgeProtoCache = grpc.loadPackageDefinition(packageDefinition) as any;
  return judgeProtoCache;
}

export class SandboxGrpcClient implements ISandboxGrpcClient {
  private readonly stub: ISandboxGrpcStub;
  private readonly sandboxAddress: string;

  constructor(deps: SandboxGrpcClientDependencies) {
    this.sandboxAddress = deps.sandboxAddress;
    this.stub = deps.stub;
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
    grpc.closeClient(this.stub as unknown as grpc.Client);
  }
}

/** Creates a sandbox gRPC client backed by the cached proto definition and current env config. */
export function createSandboxGrpcClient(): ISandboxGrpcClient {
  const sandboxAddress = process.env.SANDBOX_GRPC_URL || 'localhost:50051';
  const judgeProto = getJudgeProto();
  const stub = new judgeProto.judge.SandboxService(
    sandboxAddress,
    grpc.credentials.createInsecure()
  ) as ISandboxGrpcStub;

  return new SandboxGrpcClient({
    sandboxAddress,
    stub,
  });
}

