# Slice 11: Worker Bootstrap Factories And Injected gRPC Client

## Summary

Mirror slice 10 cho worker:

- Bỏ `workerService` singleton export
- Bỏ `sandboxGrpcClient` singleton và proto load ở import-time
- `worker.server.ts` trở thành import-safe: import không `config()`, không `start()`, không đăng ký signal/error handlers

**Không đổi DB/schema, HTTP API, gRPC wire contract, queue payload, hay judge behavior.**

Monorepo deploy atomic — không cần tách giai đoạn.

---

## Preconditions

```
Slice 10 đã hoàn thành:
→ check:refactor-guards pass (bao gồm singleton-sandbox-imports gate)
→ ISandboxService interface đã được export từ sandbox app
→ open handle CI step pass không cần --forceExit
```

---

## Key Changes

### 1. Worker service chuyển sang factory + injected deps

`apps/worker/src/services/worker.service.ts`:

- Bỏ `export const workerService = new WorkerService()`
- Giữ `WorkerService` class
- Export `IWorkerService` tối giản — chỉ giữ những gì bootstrap và test thực sự cần:

```ts
interface IWorkerService {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

`getStats()` không nằm trong interface — đây là implementation detail, không phải contract của bootstrap/test. Nếu cần expose stats (monitoring, health endpoint), thêm method cụ thể vào concrete class, không vào interface.

- `WorkerService` không còn import `sandboxGrpcClient` singleton
- Constructor/factory nhận `ISandboxGrpcClient` và optional breaker factory

```ts
createWorkerService(deps: {
  sandboxClient: ISandboxGrpcClient;
  createBreaker?: (bullWorker: Worker, sandboxClient: ISandboxGrpcClient) => SandboxBreaker;
}): IWorkerService
```

**Default cho `createBreaker`:** nếu không truyền, dùng `createSandboxBreaker` từ `circuit-breaker.ts` làm default. Behavior này phải được document trong JSDoc của factory. Test muốn inject mock breaker thì truyền vào explicitly.

### 2. gRPC client thành import-safe

`apps/worker/src/grpc/client.ts`:

- Bỏ `export const sandboxGrpcClient = new SandboxGrpcClient()`
- Bỏ proto load ở top-level
- `getJudgeProto()` là module-level cached lazy getter — cache tồn tại trong process lifetime, không reset giữa các lần gọi trong cùng process. Test cần mock proto loader ở module level nếu muốn test lazy loading behavior.

```ts
interface ISandboxGrpcClient {
  executeCode(request: GrpcExecutionRequest): Promise<GrpcExecutionResponse>;
  close(): void;
}

createSandboxGrpcClient(): ISandboxGrpcClient
```

`SandboxGrpcClient` chỉ được tạo khi `createSandboxGrpcClient()` được gọi trong startup path. Log "connected to sandbox" chỉ xuất hiện khi instance được tạo — mock client trong test không emit log này, không phải vấn đề.

### 3. Circuit breaker dùng DI

`apps/worker/src/grpc/circuit-breaker.ts`:

```ts
createSandboxBreaker(
  bullWorker: Worker,
  sandboxClient: ISandboxGrpcClient
): CircuitBreaker
```

Không còn import singleton client. Circuit breaker state reset mỗi khi process restart — đây là behavior hiện tại (process restart = new state), DI không thay đổi điều này.

### 4. Worker server thành import-safe

`apps/worker/src/worker.server.ts`:

- Bỏ top-level `config()`
- Bỏ top-level `process.on(...)`
- Bỏ top-level `void startWorker()`

```ts
export async function startWorkerProcess(): Promise<void>;
```

`startWorkerProcess()` thực hiện theo thứ tự:

1. `config()` — load env
2. `createSandboxGrpcClient()` — tạo gRPC client
3. `createWorkerService({ sandboxClient, createBreaker })` — tạo worker service
4. Register `SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection`
5. `workerService.start()`

**Test không được gọi `startWorkerProcess()` trực tiếp** — vì bước 4 đăng ký global error handlers (`uncaughtException`, `unhandledRejection`) sẽ interfere với Jest error handling. Test verify startup wiring bằng cách mock từng factory và assert call order riêng lẻ. `worker.server.test.ts` phải có:

```ts
afterAll(() => {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
});
```

Giữ entrypoint file và scripts hiện tại:

```ts
if (require.main === module) {
  void startWorkerProcess().catch(console.error);
}
```

### 5. Guardrails

Thêm `check:no-worker-singleton-imports` vào `check:refactor-guards`:

```
Pattern (fail nếu tìm thấy ngoài scope loại trừ):
  export const workerService = new WorkerService
  export const sandboxGrpcClient = new SandboxGrpcClient
  import { workerService }        (trong worker.server.ts)
  import { sandboxGrpcClient }    (trong active worker source)

Loại trừ: tests/, scripts/archive/, *.test.ts, *.spec.ts
```

Gate chạy tự động trong CI cùng với các gate từ các slice trước.

---

## Important Interfaces

**Internal-only factories sau slice này:**

```ts
createWorkerService(deps: {
  sandboxClient: ISandboxGrpcClient;
  createBreaker?: (bullWorker: Worker, sandboxClient: ISandboxGrpcClient) => SandboxBreaker;
}): IWorkerService   // default createBreaker = createSandboxBreaker nếu không truyền

createSandboxGrpcClient(): ISandboxGrpcClient

startWorkerProcess(): Promise<void>
```

**Interfaces cho testability:**

```ts
interface IWorkerService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface ISandboxGrpcClient {
  executeCode(request: GrpcExecutionRequest): Promise<GrpcExecutionResponse>;
  close(): void;
}
```

**Không đổi:**

- `QueueJob` và queue payload
- gRPC request/response shape
- Submission finalization semantics
- HTTP/gRPC wire contract

---

## Test Plan

### Import safety

- Import `worker.server.ts`: không gọi `dotenv.config()`, không `start()`, không add listeners cho `SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection`
- Verify: `process.listenerCount('uncaughtException') === 0` sau import
- Import `grpc/client.ts`: không gọi `protoLoader.loadSync`, không tạo gRPC stub
- Verify: mock `protoLoader.loadSync` → assert không được gọi khi chỉ import module

### DI và startup wiring

`worker.service.test.ts`:

- Dùng mock implement `ISandboxGrpcClient` — không mock singleton module
- Test các behavior: job processing, error handling, circuit breaker trigger

`worker.server.test.ts`:

- Mock `createSandboxGrpcClient`, `createWorkerService` và assert call order trong `startWorkerProcess()`
- Verify: `config()` được gọi trước `createSandboxGrpcClient()`
- Verify: `workerService.start()` được gọi sau signal handler registration
- `afterAll(() => process.removeAllListeners(...))` bắt buộc

`grpc.client.test.ts`:

- Import module → assert `protoLoader.loadSync` chưa được gọi
- Gọi `createSandboxGrpcClient()` → assert proto được load lúc này
- `getJudgeProto()` cache: gọi 2 lần → `protoLoader.loadSync` chỉ được gọi 1 lần

### Regression

- Focused suites vẫn pass không cần `--forceExit`
- Worker → sandbox gRPC flow không đổi: `cpp`, `java`, `python`
- Accepted / wrong answer / compile error / runtime error không đổi

### Guardrails

- `check:no-worker-singleton-imports` pass: 0 singleton export/import trong active source
- `check:no-runtime-barrel-imports` và `check:refactor-guards` vẫn pass

### Definition of Done

- 0 `export const workerService = new WorkerService` (grep gate pass)
- 0 `export const sandboxGrpcClient = new SandboxGrpcClient` (grep gate pass)
- Import `worker.server.ts`: `process.listenerCount('uncaughtException') === 0`
- `worker.server.test.ts` có `afterAll` cleanup listeners
- `grpc.client.test.ts` verify lazy proto load behavior

---

## Assumptions

- `WorkerService` constructor là sync — `createWorkerService()` giữ sync. Nếu phát hiện async dependency trong constructor, cần resolve trước khi implement (tương tự precondition `SandboxService` ở slice 10).
- Queue/finalization modules đã đủ import-safe từ slice 9; slice này chỉ dọn bootstrap worker + gRPC client.
- Giữ `apps/worker/src/worker.server.ts` làm entrypoint; không đổi script path.
- Circuit breaker state reset mỗi process restart — DI không thay đổi behavior này.
- `getJudgeProto()` cache là module-level; test cần mock `protoLoader` ở module level để test lazy load behavior, không reset cache giữa tests trong cùng suite.
