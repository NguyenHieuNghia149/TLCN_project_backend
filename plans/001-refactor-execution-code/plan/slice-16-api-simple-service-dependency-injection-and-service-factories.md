# Slice 16: API Simple Service Dependency Injection And Service Factories

## Summary

- Dọn `new Repository()` / hidden dependency creation cho nhóm API service đơn giản ngay sau Slice 15.
- Scope giữ đúng 8 service:
  - `CommentService`
  - `LearningProcessService`
  - `LearnedLessonService`
  - `LessonDetailService`
  - `AdminUserService`
  - `AdminLessonService`
  - `AdminTopicService`
  - `DashboardService`
- Đã xác nhận từ repo:
  - `DashboardService` thực sự dùng đủ 6 repo hiện có: `user`, `lesson`, `problem`, `submission`, `exam`, `topic`
  - `LessonDetailService.getAllLessons()` đang dynamic-import **class** `LessonRepository`, không phải singleton
  - `adminTeacher.routes.ts` hiện vẫn đang `new AdminUserService()`, nên phải update trong slice này
- Không dùng subagent cho slice này.

## Key Changes

### 1. Service constructors chuyển sang dependency object

- Mỗi service trong scope đổi sang constructor nhận dependency object, không tự tạo repo/service nội bộ.
- Pattern chốt:

```ts
constructor(deps: { commentRepository: CommentRepository }) {
  this.commentRepository = deps.commentRepository;
}
```

- Không dùng `this.deps.*` xuyên suốt class; constructor sẽ unwrap dependency object vào private fields sẵn có để giữ code diff nhỏ.
- Dependency bags cụ thể:

```ts
CommentService({ commentRepository });
LearningProcessService({ learningProcessRepository });
LearnedLessonService({ learnedLessonRepository });
LessonDetailService({ lessonDetailRepository, lessonRepository });
AdminUserService({ adminUserRepository });
AdminLessonService({ adminLessonRepository });
AdminTopicService({ topicRepository });
DashboardService({
  userRepository,
  lessonRepository,
  problemRepository,
  submissionRepository,
  examRepository,
  topicRepository,
});
```

- `LessonDetailService.getAllLessons()` bỏ `await import(...)` và dùng `lessonRepository` đã inject.
- Không đổi logic method, response mapping, exception behavior, hay validation.

### 2. Add service factories and update route composition roots

- Thêm factory cạnh từng service:

```ts
createCommentService();
createLearningProcessService();
createLearnedLessonService();
createLessonDetailService();
createAdminUserService();
createAdminLessonService();
createAdminTopicService();
createDashboardService();
```

- Mỗi factory tạo concrete repositories và trả về service đã wire sẵn.
- Route factories liên quan đổi từ `new XService()` sang `createXService()`:
  - comment
  - learningprocess
  - learned-lesson
  - lessonDetail
  - adminUser
  - adminTeacher
  - adminLesson
  - adminTopic
  - dashboard
- `adminTeacher.routes.ts` bắt buộc dùng `createAdminUserService()`.
- `adminLesson.routes.ts` giữ nguyên `LessonUploadController` wiring cho `/parse-content`.
- `registerRoutes()` không đổi mount order.

### 3. Guardrails

- Thêm `check:no-api-simple-service-self-instantiation` và nối vào `check:refactor-guards`.
- Guard scan đúng 8 service files trong scope, fail nếu còn:
  - `new .*Repository(`
  - `new .*Service(`
  - `await import(`
- Guard scan các route files tương ứng, fail nếu còn direct:
  - `new CommentService(`
  - `new LearningProcessService(`
  - `new LearnedLessonService(`
  - `new LessonDetailService(`
  - `new AdminUserService(`
  - `new AdminLessonService(`
  - `new AdminTopicService(`
  - `new DashboardService(`
- Exclude:
  - `tests/`
  - `scripts/archive/`
  - `*.test.ts`
  - `*.spec.ts`
- Không scan heavy services ngoài scope.

## Important Interfaces

```ts
export function createCommentService(): CommentService;
export function createLearningProcessService(): LearningProcessService;
export function createLearnedLessonService(): LearnedLessonService;
export function createLessonDetailService(): LessonDetailService;
export function createAdminUserService(): AdminUserService;
export function createAdminLessonService(): AdminLessonService;
export function createAdminTopicService(): AdminTopicService;
export function createDashboardService(): DashboardService;
```

- Constructor shapes sau slice này:

```ts
new CommentService({ commentRepository });
new LessonDetailService({ lessonDetailRepository, lessonRepository });
new DashboardService({
  userRepository,
  lessonRepository,
  problemRepository,
  submissionRepository,
  examRepository,
  topicRepository,
});
```

- Không tạo `interfaces/` hay `contracts/` folder mới.
- Không move types/contracts sang `packages/shared`.

## Test Plan

- Thêm focused unit tests cho cả 8 service:
  - inject fake repos
  - verify method chính gọi repo đúng
  - verify service không cần tự tạo dependency để chạy
- Mandatory coverage:
  - `LessonDetailService.getAllLessons()` dùng injected `lessonRepository`, không dynamic import
  - `DashboardService.getStats()` verify cả 6 repos trong dependency bag được gọi đúng
- Thêm factory tests cho 8 `createXService()`:
  - trả đúng service type
  - gọi được method cơ bản mà không throw
- Update route composition tests từ Slice 15:
  - route factories gọi `createXService()`
  - controller vẫn nhận đúng service instance
  - `adminLesson` vẫn giữ `/parse-content` hoạt động qua `LessonUploadController`
- Regression:
  - `check:no-api-simple-service-self-instantiation`
  - `check:refactor-guards`
  - `npx tsc -p tsconfig.json --noEmit`
  - focused Jest cho 8 service tests + factory tests + updated route composition
  - `npm run test:runtime-open-handles`
  - `npm run build`

## Assumptions

- Service factory pattern tiếp tục là chuẩn mặc định cho wiring app-local ở API.
- Constructors của 8 service trong scope vẫn sync.
- Slice này không mở rộng sang orchestration-heavy services:
  - `AuthService`
  - `ChallengeService`
  - `FavoriteService`
  - `ExamService`
  - `SubmissionService`
  - `NotificationService`
  - `ExamAutoSubmitService`
- `LessonUploadController` tiếp tục out of scope; chỉ giữ nguyên wiring.
- Mọi function mới trong slice này có JSDoc ngắn.
