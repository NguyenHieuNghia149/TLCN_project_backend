# Slice 10: Sandbox Bootstrap Factories And Dependency Injection

## Summary

Dọn app-layer singleton và top-level startup side effects còn lại trong sandbox:

- Không còn `sandboxService` singleton export từ module
- `sandbox.controller`, `sandbox.routes`, `grpc/server`, và `sandbox.server` đều dùng injected service instance
- Import `sandbox.server.ts` không tự `listen()` HTTP, không tự `bindAsync()` gRPC, không tự đăng ký signal handlers

**Không đổi HTTP/gRPC contract, không đổi judge behavior, không đổi DB/schema.**

Monorepo deploy atomic — không cần tách giai đoạn.

---

## Preconditions

```
Slice 9 đã hoàn thành:
→ check:no-runtime-barrel-imports pass
→ open handle CI step pass không cần --forceExit

Xác nhận trước khi implement:
→ SandboxService constructor: YAML load và workspace dir creation là sync hay async?
   Nếu async → createSandboxService() phải trả Promise<SandboxService>
               và startSandboxServer() phải là async
   Nếu sync  → signature như plan giữ nguyên
→ Quyết định này ảnh hưởng toàn bộ factory signatures; phải resolve trước khi viết code
```

---

## Key Changes

### 1. Remove sandbox app singletons

`sandbox.service.ts`:

- Bỏ `export const sandboxService = new SandboxService()`
- Giữ `SandboxService` class
- Thêm factory `createSandboxService(): SandboxService` (hoặc `Promise<SandboxService>` nếu constructor async — xem preconditions)

`sandbox.controller.ts`:

- `SandboxController` nhận `sandboxService` qua constructor
- Không import service singleton

`sandbox.routes.ts`:

- Đổi từ top-level router sang factory:

```ts
createSandboxRouter(sandboxService: SandboxService): Router
```

Controller được tạo bên trong factory bằng injected service.

### 2. Make gRPC server dependency-injected

`apps/sandbox/src/grpc/server.ts` không import service singleton. Tách handler thành factory:

```ts
createExecuteCodeHandler(sandboxService: SandboxService): HandleCall<...>
createGrpcServer(sandboxService: SandboxService): grpc.Server
startGrpcServer(sandboxService: SandboxService, port?: number): grpc.Server
```

`executeCode` logic giữ nguyên output/status mapping — chỉ đổi nguồn service từ singleton sang injected.

Để test mock `SandboxService` không fragile: extract `ISandboxService` interface hoặc abstract class từ `SandboxService`. Test dùng interface để tạo mock, không phụ thuộc concrete class.

### 3. Make sandbox server import-safe

`sandbox.server.ts` đổi từ top-level startup sang exported factories:

```ts
createSandboxApp(sandboxService: SandboxService): Express
startSandboxServer(): Promise<{
  httpServer: Server;
  grpcServer: grpc.Server;
}>
```

**Lưu ý về return type:** `sandboxService` không được trả ra ngoài từ `startSandboxServer()` — không có use case nào cần caller access instance sau khi server đã start. Giữ service instance private trong `startSandboxServer()`.

Trong `startSandboxServer()`:

- Tạo **một** `sandboxService` instance
- Inject cùng instance đó vào HTTP app và gRPC server
- Đăng ký shutdown handlers (`SIGTERM`, `SIGINT`) ở đây, không ở module top-level

Giữ file entrypoint hiện tại, thêm module-safe startup guard:

```ts
if (require.main === module) {
  startSandboxServer().catch(console.error);
}
```

Khi import file trong test, không có server nào tự khởi động.

**Test không được gọi `startSandboxServer()` trực tiếp** — dùng `createSandboxApp()` và `createGrpcServer()` riêng lẻ để tránh signal handler registration. Test setup nên có:

```ts
afterAll(() => process.removeAllListeners('SIGTERM', 'SIGINT'));
```

Nếu test vô tình gọi `startSandboxServer()`, signal handlers sẽ tồn tại sau khi test kết thúc và có thể interfere với test runner.

### 4. Keep surface unchanged

Giữ nguyên HTTP ops/debug endpoints:

- `/api/sandbox/execute`
- `/api/sandbox/status`
- `/api/sandbox/health`
- `/api/sandbox/test`

Giữ nguyên gRPC `SandboxService.ExecuteCode`.

`SandboxService` constructor vẫn có side effects nội bộ (workspace dir, YAML load) khi explicitly instantiated. Slice này không mở rộng sang lazy-init bên trong service class.

### 5. Guardrails

Thêm CI grep gate vào `check:refactor-guards`:

```
Pattern:  import { sandboxService }   (singleton import)
          import sandboxService        (default singleton import)

Scan:     apps/sandbox/src/sandbox.controller.ts
          apps/sandbox/src/sandbox.routes.ts
          apps/sandbox/src/grpc/server.ts
          apps/sandbox/src/sandbox.server.ts

Fail nếu: tìm thấy bất kỳ match nào trong các file trên
```

Gate chạy tự động trong CI, không phải manual grep.

---

## Important Interfaces

**Internal-only factories sau slice này:**

```ts
createSandboxService(): SandboxService   // hoặc Promise<SandboxService> nếu async
new SandboxController(sandboxService: SandboxService)
createSandboxRouter(sandboxService: SandboxService): Router
createGrpcServer(sandboxService: SandboxService): grpc.Server
createSandboxApp(sandboxService: SandboxService): Express
startSandboxServer(): Promise<{
  httpServer: Server;
  grpcServer: grpc.Server;
}>
```

**Interface cho testability:**

```ts
interface ISandboxService {
  executeCode(request: ExecuteCodeRequest): Promise<ExecuteCodeResponse>;
  // ... other methods
}
```

`SandboxService` implements `ISandboxService`. Test dùng `ISandboxService` để tạo mock.

**Public HTTP/gRPC request/response shape: không đổi.**

---

## Test Plan

### Import safety

- Import `sandbox.server.ts` không gọi `server.listen`
- Import `sandbox.server.ts` không gọi `startGrpcServer` / `bindAsync`
- Import không đăng ký `SIGTERM`/`SIGINT` handlers ngoài `startSandboxServer()`
- Verify bằng: import module trong test, assert `process.listenerCount('SIGTERM') === 0`

### Dependency injection

- `grpc.server.test.ts` dùng mock implement `ISandboxService`, không mock singleton module
- Route/controller tests dùng fake `ISandboxService` instance — không cần mock module resolution
- `createSandboxApp(mockService)` trả Express app có thể test với supertest

### HTTP behavior

- `/api/sandbox/health`, `/status`, `/execute`, `/test` vẫn hoạt động qua injected service
- 404/error middleware behavior không đổi

### Regression

- Worker → gRPC sandbox path vẫn pass: `cpp`, `java`, `python`
- Accepted / wrong answer / compile error / runtime error không đổi

### Guardrails

- CI grep gate `check:singleton-sandbox-imports` pass: 0 singleton import trong 4 file target
- Gate từ các slice trước vẫn pass

### Definition of Done

- 0 singleton `sandboxService` import trong controller, routes, grpc server, sandbox server
- Import `sandbox.server.ts` không trigger `listen()` hay `bindAsync()`
- `ISandboxService` interface được export và dùng trong test mocks
- `process.listenerCount('SIGTERM') === 0` sau import (không sau `startSandboxServer()`)

---

## Assumptions

- Giữ `sandbox.server.ts` làm entrypoint; không đổi `package.json` script path.
- Giữ sandbox HTTP ops/debug surface thêm ít nhất một slice; chưa drop HTTP server.
- Slice này chỉ dọn sandbox app bootstrap; không mở rộng sang DI cleanup cho API và worker.
- `SandboxService` constructor sync/async cần được verify trước khi implement — đây là blocker cho factory signature.
- Test không gọi `startSandboxServer()` trực tiếp; chỉ dùng `createSandboxApp()` và `createGrpcServer()` riêng lẻ.
