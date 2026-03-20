# Slice 13: API Route Factories And Lazy SSE Service

## Summary

Tiếp nối slice 12 bằng cách remove remaining import-time side effects trong API route layer:

- Convert API route modules từ top-level `Router()` / `new Service()` / `new Controller()` sang factory functions
- Make SSE lazy — import submission controller/routes không còn tạo Redis subscriber
- End state: `index.ts` có thể static-import `registerRoutes` lại; route modules import-safe; `sse.service.ts` không còn eager singleton

**Không đổi DB/schema, HTTP API shape, queue payload, hay gRPC/runtime contract.**

---

## Preconditions

```
Slice 12 đã hoàn thành:
→ check:no-api-bootstrap-side-effects pass
→ createApiApp() và startApiServer() đã là factory-based
→ open handle CI step pass không cần --forceExit

Xác nhận trước khi implement:
→ streamSubmissionStatus() có chain .on().on() không?
   Nếu có: ISubmissionEventStream.on() phải trả ISubmissionEventStream, không phải unknown
   Nếu không: return type unknown là fine
→ Thứ tự mount routes hiện tại trong index.ts là gì?
   Phải giữ nguyên thứ tự đó trong registerRoutes()
```

---

## Key Changes

### 1. Make SSE lazy và testable

`apps/api/src/services/sse.service.ts`:

- Bỏ `export const sseService = new SseService()`
- Export interface hẹp cho controller:

```ts
/** Interface tối giản để submission controller subscribe/unsubscribe events */
export interface ISubmissionEventStream {
  on(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
  removeListener(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
}
```

Nếu verify từ preconditions rằng không có chaining, đổi return type thành `unknown`.

```ts
/** Trả singleton SseService, tạo lần đầu khi được gọi. Không tạo Redis connection khi import module. */
export function getSseService(): ISubmissionEventStream;

/** Disconnect Redis subscriber và clear cached instance. Chỉ dùng trong afterEach của test. */
export async function resetSseServiceForTesting(): Promise<void>;
```

`getSseService()` tạo `SseService` lần đầu và cache cho process lifetime. `resetSseServiceForTesting()` disconnect và clear cache — phải được gọi với `await` trong `afterEach`.

`sse.service.test.ts` phải có:

```ts
afterEach(async () => {
  await resetSseServiceForTesting(); // bắt buộc — tránh Redis connection leak giữa tests
});
```

### 2. Inject SSE lazily vào submission streaming

`apps/api/src/controllers/submission.controller.ts`:

- Bỏ direct `sseService` singleton import
- Constructor nhận provider thay vì instance:

```ts
constructor(
  private readonly submissionService: SubmissionService,
  /** Provider được gọi lazy bên trong method, không trong constructor */
  private readonly getSubmissionEventStream: () => ISubmissionEventStream
) {}
```

`streamSubmissionStatus()` gọi `this.getSubmissionEventStream()` bên trong method body — không trong constructor. Router/app creation không touch Redis.

Giữ nguyên toàn bộ SSE behavior:

- Cùng headers
- Cùng heartbeat interval
- Cùng terminal-status cleanup
- Cùng payload truncation behavior

### 3. Convert route modules sang factories

Cho tất cả files trong `apps/api/src/routes/**` trừ `routes/admin.ts`:

```ts
/** Tạo và trả Express Router cho submission endpoints. Không tạo Redis/DB connection khi gọi. */
export function createSubmissionRouter(): Router;

/** Tạo và trả Express Router cho notification endpoints. */
export function createNotificationRouter(): Router;

/** Tạo và trả Express Router cho challenge endpoints. */
export function createChallengeRouter(): Router;

// ... pattern tương tự cho các route modules còn lại
```

Bên trong mỗi factory:

1. Tạo `Router()`
2. Tạo route-local rate limiters
3. Tạo required services/controllers
4. Đăng ký handlers
5. Return router

**Thứ tự mount trong `registerRoutes()` phải giữ nguyên thứ tự hiện tại** — middleware ordering trong Express ảnh hưởng auth scope và rate limiter behavior.

`routes/admin.ts` giữ nguyên factory shape hiện tại — out of scope.

### 4. `registerRoutes` và `index.ts` cleanup

`apps/api/src/routes/index.ts`:

```ts
/** Mount tất cả API routes lên Express app theo thứ tự chuẩn. */
export function registerRoutes(app: Application): void;
```

`registerRoutes(app)` static import các route factories và call chúng theo đúng thứ tự.

`apps/api/src/index.ts` đổi lại thành static import `registerRoutes`:

```ts
// Allowed: static import vì routes/index.ts đã import-safe
import { registerRoutes } from './routes';

// Vẫn lazy (require bên trong startApiServer()):
// ./routes/admin
// ./cron/watchdog
// ./services/exam-auto-submit.service
// ./services/websocket.service
```

### 5. Guardrails

**`check:no-api-route-side-effects`** — thêm vào `check:refactor-guards`:

```
Fail nếu trong non-admin route files:
  top-level: const router = Router(
  top-level: new .*Controller(
  top-level: new .*Service(
  top-level: rateLimitMiddleware(

Fail nếu:
  submission.controller.ts import sseService
  sse.service.ts export const sseService = new SseService(
```

**Update `check:no-api-bootstrap-side-effects`** — bỏ pattern fail cho `./routes` import trong `index.ts` (vì `registerRoutes` đã import-safe). Giữ nguyên tất cả pattern fail khác cho startup-only imports.

---

## Important Interfaces

```ts
/** Interface tối giản để subscribe/unsubscribe submission events */
export interface ISubmissionEventStream {
  on(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
  removeListener(event: string, listener: (data: unknown) => void): ISubmissionEventStream;
}

/** Lazy singleton getter — không tạo Redis khi import module */
export function getSseService(): ISubmissionEventStream;

/** Cleanup cho test — disconnect và clear cache */
export async function resetSseServiceForTesting(): Promise<void>;

export function createSubmissionRouter(): Router;
export function createNotificationRouter(): Router;
export function createChallengeRouter(): Router;
// ... pattern tương tự cho các route modules còn lại

/** Mount tất cả routes theo thứ tự chuẩn */
export function registerRoutes(app: Application): void;
```

**Không đổi:**

- Route URLs
- Middleware behavior
- Controller/service public behavior
- SSE payload shape và stream semantics

---

## Test Plan

### SSE service

`sse.service.test.ts`:

- Import module không tạo Redis hay subscribe
- `getSseService()` khởi tạo đúng một lần, gọi lần 2 trả cùng instance
- `resetSseServiceForTesting()`: sau reset, `getSseService()` tạo instance mới
- `afterEach(async () => await resetSseServiceForTesting())` — bắt buộc trong mọi test trong file này

### Submission streaming

`submission.controller.test.ts`:

- Constructor không gọi `getSseService()` — verify bằng mock provider không được gọi
- `streamSubmissionStatus()` gọi provider lazily và đăng ký/remove listeners đúng
- Terminal status cleanup behavior không đổi
- Heartbeat behavior không đổi

### Route factories

Minimum coverage bắt buộc — mỗi route module phải có ít nhất một test:

- **Submission route:** `createSubmissionRouter()` không gọi `getSseService()` khi tạo router; endpoint chính hoạt động đúng với supertest
- **Notification route:** router được tạo thành công; endpoint chính respond đúng
- **Challenge route:** router được tạo thành công; endpoint chính respond đúng
- **Các route còn lại:** ít nhất smoke test — router tạo thành công, không throw

**Thứ tự mount:** test verify routes được mount theo đúng thứ tự trong `registerRoutes()` — ít nhất assert rằng auth-protected routes không accessible trước auth middleware.

### API bootstrap regression

- `api.server.test.ts` vẫn pass
- `check:no-api-route-side-effects` pass
- Updated `check:no-api-bootstrap-side-effects` pass: `./routes` import allowed; startup-only imports vẫn fail

### Open handles

- `test:runtime-open-handles` pass — không có Redis connection leak từ SSE
- Verify: import `sse.service.ts` → `getSseService()` chưa gọi → 0 Redis connection

### Definition of Done

- 0 eager singleton trong non-admin route files (grep gate pass)
- `sse.service.ts` không còn `export const sseService = new SseService()`
- `index.ts` static import `registerRoutes` trở lại
- Mọi function mới trong slice này có JSDoc ngắn giải thích purpose
- `resetSseServiceForTesting()` được gọi trong `afterEach` của `sse.service.test.ts`
- Thứ tự mount routes trong `registerRoutes()` giống với thứ tự hiện tại

---

## Assumptions

- `routes/admin.ts` đã đúng factory shape — out of scope.
- `submissionService`, `notificationService`, `examAutoSubmitService` singleton cleanup deferred sang slice sau.
- SSE là singleton có import-time Redis side effect duy nhất trong area này — making it lazy là mandatory trong slice này.
- Mọi function mới phải có JSDoc — requirement này carry forward từ plan gốc.
- `ISubmissionEventStream.on()` return type cần được verify từ preconditions trước khi implement.
