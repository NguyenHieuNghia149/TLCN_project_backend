# Slice 15: API Controller Injection And Composition Root Cleanup

## Summary

- Slice 15 sẽ giữ **chung một slice** cho toàn bộ 9 controller còn self-instantiation; không cần tách admin ra riêng.
- Scope chính:
  - bỏ pattern `this.* = new *Service()` trong API controllers
  - để route factories làm composition root thật sự cho controller dependencies
  - **không** đụng vào service → repository injection trong slice này
- Đã xác nhận từ repo:
  - còn đúng 9 controller trong scope
  - `LessonUploadController` không self-instantiate nên **out of scope**
  - `registerRoutes()` hiện đã đúng mount order; slice này không đổi order hay route URLs
  - không thấy focused test hiện có cho các controller này, nên slice này phải thêm test mới chứ không chỉ sửa test cũ

## Controllers In Scope

- Non-admin:
  - [comment.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/comment.controller.ts)
  - [learningprocess.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/learningprocess.controller.ts)
  - [learned-lesson.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/learned-lesson.controller.ts)
  - [lessonDetail.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/lessonDetail.controller.ts)
- Admin:
  - [adminUser.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/admin/adminUser.controller.ts)
  - [adminTeacher.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/admin/adminTeacher.controller.ts)
  - [adminLesson.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/admin/adminLesson.controller.ts)
  - [adminTopic.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/admin/adminTopic.controller.ts)
  - [dashboard.controller.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/controllers/admin/dashboard.controller.ts)

## Key Changes

### 1. Controller constructors switch to injected services

- Mỗi controller trong scope đổi sang constructor injection với **concrete service class**.
- Pattern chuẩn:

```ts
export class CommentController {
  constructor(private readonly commentService: CommentService) {}
}
```

- Không tạo `interfaces/` hay `contracts/` folder mới.
- Chỉ tạo local interface nếu trong quá trình test có controller thật sự khó mock bằng concrete class; mặc định **không thêm interface mới** ở slice này.
- Giữ nguyên handler methods, response shape, validation, auth assumptions, và method binding style hiện tại.
  - Arrow handlers giữ nguyên arrow handlers.
  - Những method đang dùng `.bind(controller)` ở route thì giữ nguyên pattern đó, chỉ đổi cách tạo controller.

### 2. Route factories become the composition root

- Update các route factories tương ứng để:
  1. tạo service
  2. tạo controller với injected service
  3. đăng ký handlers như hiện tại
- Route files cần đổi:
  - [comment.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/comment.routes.ts)
  - [learningprocess.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/learningprocess.routes.ts)
  - [learned-lesson.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/learned-lesson.routes.ts)
  - [lessonDetail.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/lessonDetail.routes.ts)
  - [adminUser.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/admin/adminUser.routes.ts)
  - [adminTeacher.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/admin/adminTeacher.routes.ts)
  - [adminLesson.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/admin/adminLesson.routes.ts)
  - [adminTopic.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/admin/adminTopic.routes.ts)
  - [dashboard.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/admin/dashboard.routes.ts)
- Concrete service wiring to use:
  - `CommentController` ← `new CommentService()`
  - `LearningProcessController` ← `new LearningProcessService()`
  - `LearnedLessonController` ← `new LearnedLessonService()`
  - `LessonDetailController` ← `new LessonDetailService()`
  - `AdminUserController` ← `new AdminUserService()`
  - `AdminTeacherController` ← `new AdminUserService()`
  - `AdminLessonController` ← `new AdminLessonService()`
  - `AdminTopicController` ← `new AdminTopicService()`
  - `DashboardController` ← `new DashboardService()`
- [adminLesson.routes.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/admin/adminLesson.routes.ts) vẫn giữ `new LessonUploadController()` như hiện tại vì controller này không có self-instantiation và không thuộc scope.
- [routes/index.ts](/D:/Workspace/TLCN/project/backend/apps/api/src/routes/index.ts) **không đổi mount order**. Chỉ chạm file nếu cần do import signature, còn mặc định giữ nguyên.

### 3. Guardrail for controller self-instantiation

- Thêm `check:no-api-controller-self-instantiation` và nối vào `check:refactor-guards`.
- Scan `apps/api/src/controllers/**`.
- Fail nếu còn match:
  - `this\.\w+\s*=\s*new\s+\w+Service\(`
  - `this\.\w+\s*=\s*new\s+\w+Repository\(`
- Exclude:
  - `tests/`
  - `scripts/archive/`
  - `*.test.ts`
  - `*.spec.ts`
- Guard này chỉ áp cho `controllers/`, không áp cho `services/`, để phản ánh đúng scope slice.

### 4. JSDoc rule for new functions

- Mọi function mới thêm trong slice này phải có note/JSDoc ngắn.
- Nếu không cần thêm function mới ngoài test helpers/guard helpers thì không backfill JSDoc cho code cũ ngoài scope.

## Test Plan

- Thêm focused controller tests cho **tất cả 9 controller** trong scope.
- Mỗi controller test tối thiểu phải cover:
  - constructor nhận injected service, không tự tạo service
  - ít nhất một handler chính chạy đúng với fake/mocked service
- Minimum mapping:
  - `comment.controller.test.ts`: `createComment` hoặc `getByLesson`
  - `learningprocess.controller.test.ts`: `getUserProgress`
  - `learned-lesson.controller.test.ts`: `checkLessonCompletion` hoặc `markLessonCompleted`
  - `lessonDetail.controller.test.ts`: `getLessonById`
  - `adminUser.controller.test.ts`: `list` hoặc `getById`
  - `adminTeacher.controller.test.ts`: `list` hoặc `create`
  - `adminLesson.controller.test.ts`: `list` hoặc `create`
  - `adminTopic.controller.test.ts`: `list` hoặc `create`
  - `dashboard.controller.test.ts`: `getStats`
- Route-level regression:
  - add/update focused route tests for the 9 route files to ensure injected construction works and endpoints still bind correctly
  - `adminLesson.routes` test must confirm `LessonUploadController` path still works unchanged
- Full regression gates:
  - `check:no-api-controller-self-instantiation`
  - `check:refactor-guards`
  - `npx tsc -p tsconfig.json --noEmit`
  - focused Jest suites for converted controllers/routes
  - `npm run test:runtime-open-handles`
  - `npm run build`

## Assumptions

- 9 controllers is still a manageable single slice because every change follows the same DI pattern and does not widen into service/repository refactors.
- Concrete class injection is the default for this slice; no new local interfaces unless a specific test truly needs one.
- Service constructors may still create repositories internally; that is intentionally deferred to the next slice.
- No HTTP route, middleware order, auth scope, response payload, queue behavior, or runtime contract changes are allowed in this slice.
