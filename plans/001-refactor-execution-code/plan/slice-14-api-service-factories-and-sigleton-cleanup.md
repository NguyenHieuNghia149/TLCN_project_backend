# Slice 14: API Service Factories And Singleton Cleanup

## Summary

- Dọn nốt singleton/runtime coupling còn lại trong API layer sau Slice 13.
- Scope của slice này là:
  - bỏ `examAutoSubmitService`, `submissionService`, `notificationService` singleton exports
  - bỏ direct mutable `websocketService` import trong `NotificationService`
  - bỏ default singleton export của `LessonService`
  - đổi watchdog và API startup sang injected/service-factory shape
- Đã xác nhận từ repo hiện tại:
  - `notification.service.ts` không import ngược `exam.service.ts`, nên không có circular dependency hiện tại
  - `NotificationService` đã có null-check cho websocket, nên “skip emit khi chưa init websocket” là behavior hiện tại
  - `SubmissionService` đã có `requeuePendingSubmission(submissionId): Promise<boolean>`
  - không có consumer active nào dùng default import của `LessonService`, nên có thể xóa default singleton export trong slice này
- Mọi hàm mới trong slice này phải có JSDoc/note ngắn mô tả purpose.

## Key Changes

### 1. Replace remaining API service singletons with factories

- `submission.service.ts`
  - bỏ `export const submissionService = new SubmissionService()`
  - thêm:

```ts
/** Tạo SubmissionService mới mà không giữ singleton module-level. */
export function createSubmissionService(): SubmissionService;
```

- `notification.service.ts`
  - bỏ `export const notificationService = new NotificationService()`
  - thêm:

```ts
/** Tạo NotificationService với websocket provider tùy chọn. */
export function createNotificationService(
  getSocketService: () => IWebSocketNotifier | null = getWebSocketService
): NotificationService;
```

- `exam-auto-submit.service.ts`
  - bỏ `export const examAutoSubmitService = new ExamAutoSubmitService()`
  - thêm:

```ts
export interface IExamAutoSubmitService {
  start(checkIntervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): { isRunning: boolean; checkInterval: number | null };
}

/** Tạo auto-submit service cho startup path mà không giữ singleton module-level. */
export function createExamAutoSubmitService(): IExamAutoSubmitService;
```

- `lesson.service.ts`
  - xóa `export default new LessonService()`
  - giữ named class export `LessonService`
  - không thêm factory ở slice này

### 2. Replace mutable websocket import with accessor/getter

- `websocket.service.ts`
  - giữ `initializeWebSocket(server)` như hiện tại
  - không export bare mutable `websocketService`
  - thêm:

```ts
export interface IWebSocketNotifier {
  emitToUser(userId: string, event: string, data: unknown): void;
  getIO(): { emit(event: string, data: unknown): boolean };
}

/** Trả websocket service hiện tại nếu đã initialize, ngược lại trả null. */
export function getWebSocketService(): IWebSocketNotifier | null;

/** Reset websocket state cho test cleanup. */
export function resetWebSocketServiceForTesting(): void;
```

- Implementation detail được chốt:
  - module giữ `let websocketService: WebSocketService | null = null` nội bộ
  - `initializeWebSocket(server)` set giá trị này như hiện tại
  - `getWebSocketService()` chỉ đọc state, không tự initialize
  - `resetWebSocketServiceForTesting()` set state về `null`, không thêm shutdown behavior mới
- `NotificationService`
  - không còn `import { websocketService }`
  - constructor nhận websocket provider:

```ts
constructor(
  private readonly getSocketService: () => IWebSocketNotifier | null = getWebSocketService
) {}
```

- `notifyUser()` và `notifyAllUsers()` gọi provider bên trong method body
- nếu provider trả `null`, silently skip emit như behavior hiện tại

### 3. Remove singleton consumers from startup and business flow

- `index.ts`
  - trong `startApiServer()`:
    - lazy-load `createExamAutoSubmitService`, tạo instance local, rồi `await start()`
    - lazy-load `createSubmissionService`, tạo instance local, rồi truyền vào `initializeWatchdogCron(...)`
  - không còn destructure/use `examAutoSubmitService` singleton
- `watchdog.ts`
  - bỏ `import { submissionService }`
  - thêm:

```ts
export interface ISubmissionRecoveryService {
  /** Requeue submission nếu job không còn trong queue. */
  requeuePendingSubmission(submissionId: string): Promise<boolean>;
}

/** Khởi tạo watchdog cron với dependency recover submission đã inject. */
export function initializeWatchdogCron(submissionRecoveryService: ISubmissionRecoveryService): void;
```

- giữ nguyên:
  - cron schedule
  - idempotent init
  - queue lookup bằng `getJudgeQueueService().getJobById(...)`
  - orphan recovery logic
- `exam.service.ts`
  - bỏ dynamic import singleton `notificationService`
  - thêm:

```ts
export interface INotificationPublisher {
  notifyAllUsers(type: string, title: string, message: string, metadata?: unknown): Promise<void>;
}
```

- constructor đổi sang lazy provider:

```ts
constructor(
  private readonly getNotificationPublisher: () => INotificationPublisher =
    () => createNotificationService()
) {}
```

- provider chỉ được gọi trong `createExam()` khi `isVisible === true`, bên trong `setImmediate` callback
- giữ nguyên fire-and-forget notification behavior
- `submission.routes.ts` dùng `createSubmissionService()`
- `notification.routes.ts` dùng `createNotificationService()`
- `exam.routes.ts` tiếp tục `new ExamService()` là đủ; không cần route-level provider wiring trong slice này

### 4. Guardrails

- Thêm `check:no-api-service-singletons` và nối vào `check:refactor-guards`
- Guard fail nếu còn:
  - `export const examAutoSubmitService = new`
  - `export const submissionService = new`
  - `export const notificationService = new`
  - `export default new LessonService`
  - `import { submissionService }` trong API source
  - `import { websocketService }` ngoài `websocket.service.ts`
  - `await import('./notification.service')` trong `exam.service.ts`
  - destructure `examAutoSubmitService` từ `./services/exam-auto-submit.service` trong `index.ts`
- Loại trừ:
  - `tests/`
  - `scripts/archive/`
  - `*.test.ts`
  - `*.spec.ts`

## Important Interfaces

```ts
/** Tạo SubmissionService mới mà không giữ singleton module-level. */
export function createSubmissionService(): SubmissionService;

export interface IWebSocketNotifier {
  emitToUser(userId: string, event: string, data: unknown): void;
  getIO(): { emit(event: string, data: unknown): boolean };
}

/** Trả websocket service hiện tại nếu đã initialize, ngược lại trả null. */
export function getWebSocketService(): IWebSocketNotifier | null;

/** Reset websocket state cho test cleanup. */
export function resetWebSocketServiceForTesting(): void;

/** Tạo NotificationService với websocket provider tùy chọn. */
export function createNotificationService(
  getSocketService?: () => IWebSocketNotifier | null
): NotificationService;

export interface INotificationPublisher {
  notifyAllUsers(type: string, title: string, message: string, metadata?: unknown): Promise<void>;
}

export interface ISubmissionRecoveryService {
  requeuePendingSubmission(submissionId: string): Promise<boolean>;
}

/** Khởi tạo watchdog cron với injected recovery dependency. */
export function initializeWatchdogCron(submissionRecoveryService: ISubmissionRecoveryService): void;

export interface IExamAutoSubmitService {
  start(checkIntervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): { isRunning: boolean; checkInterval: number | null };
}

/** Tạo auto-submit service cho startup path mà không giữ singleton module-level. */
export function createExamAutoSubmitService(): IExamAutoSubmitService;
```

## Test Plan

- `api.server.test.ts`
  - update file hiện có
  - mock `createExamAutoSubmitService`, `createSubmissionService`, `initializeWatchdogCron`
  - verify startup vẫn gọi websocket init, auto-submit start, watchdog init, và listen đúng 1 lần mỗi cái
- `watchdog` unit test
  - injected `ISubmissionRecoveryService` được dùng thay vì singleton
  - queue có job thì không recover
  - queue không có job thì gọi `requeuePendingSubmission`
  - `initializeWatchdogCron()` gọi 2 lần không schedule duplicate
- `notification.service.test.ts`
  - import module không cần websocket initialized
  - `createNotificationService()` với fake socket provider emit đúng
  - provider trả `null` thì không throw và không emit
  - `afterEach(() => resetWebSocketServiceForTesting())` là bắt buộc
- `exam.service` focused unit
  - `isVisible=true` thì `setImmediate` path gọi notification provider đúng 1 lần
  - `isVisible=false` thì provider không được gọi
  - constructor không resolve provider ở construction time
- `submission.service.test.ts`
  - thêm coverage cho `createSubmissionService()`
- Regression
  - `check:no-api-service-singletons`
  - `check:refactor-guards`
  - typecheck
  - build
  - `test:runtime-open-handles`

## Assumptions

- Constructors của `SubmissionService`, `NotificationService`, `ExamAutoSubmitService`, và `LessonService` đều sync; các factory giữ sync.
- `websocket.service.ts` vẫn là startup-owned process-local state; slice này chỉ đổi cách access, không đổi lifecycle/shutdown.
- Controller-level self-instantiation trong `comment.controller`, `lessonDetail.controller`, `learningprocess.controller`, các admin controllers vẫn để slice sau.
- Không đổi URL, middleware order, auth scope, response payloads, hay exam-notification semantics ngoài việc bỏ singleton/module-global coupling.
