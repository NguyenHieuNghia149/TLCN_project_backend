# Slice 9: Make Shared Runtime Import-Safe And Lazy-Initialize Infrastructure

## Summary

Bỏ toàn bộ import-time side effects còn lại trong `packages/shared/runtime`, đặc biệt là Redis/BullMQ. Debt kỹ thuật hiện tại:

- `judgeQueueService` được tạo ngay lúc import và mở kết nối Redis/BullMQ ngầm
- Worker vẫn import từ `@backend/shared/runtime` barrel
- Bull Board route và watchdog đang chạm queue object theo kiểu khiến queue có thể bị khởi tạo quá sớm
- Test phải dùng `--forceExit` và vẫn có noise `ECONNREFUSED/ETIMEDOUT 6379`

**Slice này không đổi DB schema, HTTP API, gRPC, hay queue payload.**

Đây là monorepo — shared package và app code được build và deploy cùng nhau. Không cần tách giai đoạn deploy.

---

## Preconditions

```
Slice 8 đã hoàn thành:
→ grep gate cross-app imports pass
→ @backend/api/* alias đã xóa khỏi worker/sandbox tsconfig
```

---

## Key Changes

### 1. Lazy singleton pattern cho shared runtime

**Quyết định barrel:** bỏ hẳn re-export stateful services khỏi `packages/shared/runtime/index.ts`. Barrel chỉ export types và pure utilities. App code import stateful services qua submodule rõ ràng — không có option khác.

`packages/shared/runtime/judge-queue.ts` đổi từ eager singleton sang lazy accessor:

```ts
// Không còn: export const judgeQueueService = new JudgeQueueService()

export function getJudgeQueueService(): JudgeQueueService;
export function resetJudgeQueueServiceForTesting(): void;
```

**`resetJudgeQueueServiceForTesting()` behavior:**

- Close tất cả open connections của instance hiện tại (nếu đã init)
- Set internal singleton reference về `null`
- Lần gọi `getJudgeQueueService()` tiếp theo sẽ tạo instance mới
- Chỉ được gọi trong `afterEach`/`afterAll` của test — không dùng trong production code
- Jest parallel runner safe: mỗi worker process có module cache riêng, không share singleton

**`connect()` behavior:**

- Idempotent: nếu đã connect thì return early silently, không log warning, không throw
- Tạo Queue/Redis clients chỉ khi được gọi hoặc khi method runtime đầu tiên cần dùng
- App startup path gọi `connect()` một lần sau khi env/config đã sẵn sàng

**`disconnect()` behavior:**

- No-op an toàn nếu service chưa từng được khởi tạo — không throw
- Close connections và release resources nếu đã init

`code-security.ts` và `code-monitoring.ts` theo cùng pattern:

```ts
export function getSecurityService(): CodeSecurityService;
export function getMonitoringService(): CodeMonitoringService;
```

Không còn service nào trong `packages/shared/runtime` tạo file system/Redis side effects chỉ vì import module.

### 2. Submodule imports thay thế barrel

App code import qua submodule rõ ràng:

```ts
import { getJudgeQueueService } from '@backend/shared/runtime/judge-queue';
import { getSecurityService } from '@backend/shared/runtime/code-security';
import { getMonitoringService } from '@backend/shared/runtime/code-monitoring';
import { finalizeSubmission } from '@backend/shared/runtime/submission-finalization';
```

`apps/worker/src/worker.service.ts` đổi từ runtime barrel sang submodule imports tương tự.

### 3. Queue lifecycle API và raw queue access cleanup

`JudgeQueueService` bổ sung methods để app không phải chạm `.queue` raw:

```ts
getJobById(id: string): Promise<Job | null>
getQueueStatus(): Promise<QueueStatus>
addJob(job: QueueJob): Promise<Job>
publish(channel: string, message: unknown): Promise<void>
getQueue(): Queue   // chỉ dùng cho Bull Board registration trong admin.ts
```

**`getQueue()` scope:** chỉ được gọi trong `apps/api/src/routes/admin.ts` cho Bull Board registration. Grep gate sẽ fail nếu `getQueue()` được gọi ngoài file này.

`apps/api/src/cron/watchdog.ts`: đổi `judgeQueueService.queue.getJob(...)` → `getJobById(...)`.

`apps/api/src/routes/admin.ts`: không còn tạo Bull Board ở top-level import. Đổi sang factory:

```ts
// Trước: top-level Bull Board init → eager queue access
// Sau:
export function createAdminRouter(): Router {
  const queue = getJudgeQueueService().getQueue();
  // Bull Board được khởi tạo bên trong factory
}
```

`apps/api/src/index.ts` gọi `createAdminRouter()` trong startup path sau khi env đã sẵn sàng.

### 4. Guardrails

Thêm guard `check:no-runtime-barrel-imports`:

```
Pattern:  from '@backend/shared/runtime'   (bare barrel, không có subpath)
          require('@backend/shared/runtime')

Fail nếu: match trong apps/**, packages/** (ngoài packages/shared/runtime/index.ts itself)
Loại trừ: scripts/archive/, migrations/
Áp dụng cho cả test files — khuyến khích test import submodule đúng cách
```

Nối vào `check:refactor-guards` cùng với các gate từ slice trước.

CI step riêng cho open handle detection (xem Test Plan).

---

## Important Interfaces

**Queue service access sau slice này:**

```ts
const svc = getJudgeQueueService();
await svc.connect(); // optional eager warm-up, idempotent
await svc.addJob(job);
await svc.publish(channel, message);
const job = await svc.getJobById(submissionId);
const status = await svc.getQueueStatus();
// chỉ trong admin.ts:
const queue = svc.getQueue();
```

**Security/monitoring access sau slice này:**

```ts
getSecurityService().validateCodeSecurity(code, language);
getMonitoringService().detectMaliciousCode(code, language);
```

**Không đổi:**

- `QueueJob` payload
- Submission finalization input/output
- gRPC request/response
- HTTP response shape
- DB schema

---

## Test Plan

### Build / type

- API, worker, sandbox compile sau khi bỏ runtime barrel imports
- Grep gate `check:no-runtime-barrel-imports` pass: 0 bare barrel import trong app code
- Grep gate `getQueue()` scope pass: chỉ được gọi trong `admin.ts`

### Queue lifecycle unit tests

- `getJudgeQueueService()` không mở Redis chỉ vì import module — verify bằng mock: import module trong test, assert không có Redis connection attempt
- `connect()` idempotent: gọi 2 lần liên tiếp → chỉ tạo 1 connection, không error
- `disconnect()` no-op an toàn khi chưa init: không throw, không error
- `resetJudgeQueueServiceForTesting()`: sau reset, `getJudgeQueueService()` trả instance mới
- `getJobById()`, `addJob()`, `getQueueStatus()` hoạt động đúng sau lazy init

### Security / monitoring lazy init

- `getSecurityService()` không có side effect khi import module
- `getMonitoringService()` không có side effect khi import module

### Open handle detection (CI step bắt buộc)

```bash
# Chạy các suite liên quan với flag detect open handles
jest --testPathPattern="submission|worker|grpc|sandbox-route|rate-limit" \
     --detectOpenHandles \
     --forceExit=false
```

Gate: fail nếu Jest report open handle warnings. Đây là automated check, không phải manual observation.

### Regression

- Các suite sau pass không cần `--forceExit`:
  - `submission.service`
  - `worker.service`
  - `grpc.server`
  - `sandbox-route-boundary`
  - `rate-limit`
- Không còn `ECONNREFUSED/ETIMEDOUT 6379` trong output của focused suite
- Bull Board route vẫn boot đúng sau `createAdminRouter()`
- Watchdog vẫn skip/requeue orphaned submissions đúng qua `getJobById()`
- `cpp`, `java`, `python`: accepted / wrong answer / compile error / runtime error không đổi

### Definition of Done

- 0 bare `@backend/shared/runtime` import trong app code (grep gate pass)
- `getQueue()` chỉ được gọi trong `admin.ts` (grep gate pass)
- CI open handle detection step pass không cần `--forceExit`
- Không còn Redis noise trong focused test suites

---

## Assumptions

- Nguồn open-handle/noise chính là eager Redis/BullMQ init trong `judge-queue`; lazy init sẽ giải quyết pain test lớn nhất.
- `code-security` và `code-monitoring` theo cùng lazy pattern để shared runtime thống nhất, dù không gây rủi ro mạng như queue.
- Jest parallel runner safe vì mỗi worker process có module cache riêng — `resetJudgeQueueServiceForTesting()` không cần cross-process coordination.
- Monorepo deploy là atomic — shared package và app code build cùng nhau, không cần tách giai đoạn.
- Slice này không thay đổi rollout behavior giữa services — chỉ thay đổi lifecycle nội bộ lúc process bootstrap.
