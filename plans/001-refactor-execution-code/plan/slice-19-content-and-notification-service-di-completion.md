# Slice 19: Content And Notification Service DI Completion

## Summary

- Dọn cụm low-risk còn lại trong API layer:
  - `TopicService`
  - `LessonService`
  - `NotificationService`
- Mục tiêu:
  - bỏ `new Repository()` trong constructor của 3 service này
  - thêm `createTopicService()` và `createLessonService()`
  - giữ `createNotificationService()` nhưng chuyển nó thành factory wire đầy đủ repos + websocket provider
  - đổi `topic.routes.ts` và `lesson.routes.ts` sang dùng service factories
- Explicitly defer:
  - `AuthService`, `UserService`, `EMailService`, Google OAuth wiring
  - bug `AuthService.register()` thiếu `await verifyOTP()` để dành cho auth slice riêng
- Không đổi URL, auth scope, middleware order, rate limit, response shape, hay websocket semantics.

## Key Changes

### 1. Convert 3 services to dependency-object constructors

- `TopicService` chuyển sang:

```ts
new TopicService({ topicRepository });
```

- `LessonService` chuyển sang:

```ts
new LessonService({
  lessonRepository,
  topicRepository,
  favoriteRepository,
});
```

- `NotificationService` chuyển sang:

```ts
new NotificationService({
  notificationRepository,
  userRepository,
  getSocketService,
});
```

- Pattern giữ đồng nhất với các slice trước:
  - deps key dùng full camelCase name
  - constructor unwrap vào private fields hiện có
  - không dùng `this.deps.*` xuyên suốt class
- `NotificationService` giữ nguyên null-websocket behavior hiện tại:
  - provider trả `null` thì vẫn silently skip emit

### 2. Complete service factories and route composition

- Thêm:

```ts
/** Tạo TopicService với concrete dependencies. */
export function createTopicService(): TopicService;

/** Tạo LessonService với concrete dependencies. */
export function createLessonService(): LessonService;
```

- Giữ signature hiện có của notification factory:

```ts
/** Tạo NotificationService với concrete repositories và websocket provider tùy chọn. */
export function createNotificationService(
  getSocketService?: () => IWebSocketNotifier | null
): NotificationService;
```

- Route factories update:
  - `topic.routes.ts` dùng `createTopicService()`
  - `lesson.routes.ts` dùng `createLessonService()`
  - `notification.routes.ts` tiếp tục dùng `createNotificationService()`, không đổi route behavior
- Controllers không đổi constructor shape:
  - `TopicController(topicService)`
  - `LessonController(lessonService)`
  - `NotificationController(notificationService)`

### 3. Dependency bags locked for this slice

- `TopicService`: chỉ inject `topicRepository`
- `LessonService`: chỉ inject `lessonRepository`, `topicRepository`, `favoriteRepository`
- `NotificationService`: chỉ inject `notificationRepository`, `userRepository`, `getSocketService`
- Không thêm interface/contract folder mới; mọi type local colocate ngay trong service tương ứng nếu cần.

### 4. Guardrail

- Thêm `check:no-api-content-notify-service-self-instantiation` và nối vào `check:refactor-guards`
- Scan:
  - `topic.service.ts`
  - `lesson.service.ts`
  - `notification.service.ts`
  - `topic.routes.ts`
  - `lesson.routes.ts`
  - `notification.routes.ts`
- Fail nếu service files còn:
  - `this.* = new *Repository(`
  - `this.* = new *Service(`
  - `await import(`
- Fail nếu route files còn:
  - `new TopicService(`
  - `new LessonService(`
  - `new NotificationService(`
- Exclude `tests/`, `scripts/archive/`, `*.test.ts`, `*.spec.ts`

## Important Interfaces

```ts
export function createTopicService(): TopicService;
export function createLessonService(): LessonService;
export function createNotificationService(
  getSocketService?: () => IWebSocketNotifier | null
): NotificationService;
```

- `IWebSocketNotifier` tiếp tục reuse từ `websocket.service.ts`
- Không tạo thêm global `interfaces/` hay `contracts/`

## Test Plan

- Thêm `topic.service.test.ts`
  - inject fake `topicRepository`
  - cover ít nhất `getTopicById()` hoặc `createTopic()`
  - thêm factory test cho `createTopicService()`
- Thêm `lesson.service.test.ts`
  - inject fake `lessonRepository`, `topicRepository`, `favoriteRepository`
  - bắt buộc cover `getAllLessons(userId, topicId)` để khóa logic favorite + topic filter
  - thêm một test cho `createLesson()` hoặc `updateLesson()` để khóa dependency `topicRepository`
  - thêm factory test cho `createLessonService()`
- Update `notification.service.test.ts`
  - bỏ mock constructor-level repos, chuyển sang injected fake repos
  - giữ test null-websocket skip emit
  - giữ test emit path cho `notifyUser()` và `notifyAllUsers()`
  - `afterEach(() => resetWebSocketServiceForTesting())` tiếp tục bắt buộc
- Update `api-controller-route-composition.test.ts`
  - thêm case cho `topic.routes.ts` gọi `createTopicService()`
  - thêm case cho `lesson.routes.ts` gọi `createLessonService()`
  - thêm case cho `notification.routes.ts` gọi `createNotificationService()`
  - verify controller nhận đúng service instance
- Regression:
  - `check:no-api-content-notify-service-self-instantiation`
  - `check:refactor-guards`
  - `npx tsc -p tsconfig.json --noEmit`
  - focused Jest cho `topic.service.test.ts`, `lesson.service.test.ts`, `notification.service.test.ts`, `api-controller-route-composition.test.ts`
  - `npm run test:runtime-open-handles`
  - `npm run build`

## Assumptions

- `TopicController`, `LessonController`, và `NotificationController` đã đủ sạch; slice này không đụng controller internals.
- `notification.routes.ts` đã là factory đúng shape; slice này chỉ hoàn tất DI bên trong `NotificationService`.
- `createNotificationService()` phải giữ backward-compatible signature vì đang được `ExamService` dùng làm default provider.
- Slice này là single-agent; không cần subagent.
