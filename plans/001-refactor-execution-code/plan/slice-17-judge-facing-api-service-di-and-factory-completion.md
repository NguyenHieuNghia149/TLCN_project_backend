# Slice 17: Judge-Facing API Service DI And Factory Completion

## Summary

- Dọn tiếp 3 service nằm trực tiếp trên judge flow:
  - `ChallengeService`
  - `FavoriteService`
  - `SubmissionService`
- Defer sang slice sau:
  - `ExamService`
  - `ExamAutoSubmitService`
  - `AuthService`
  - `LessonService`
  - `TopicService`
  - `UserService`
  - `LeaderboardService`
- Đã verify từ code hiện tại:
  - `ChallengeService` dùng đủ cả 8 repo, nên giữ nguyên full dependency bag
  - `FavoriteService` dùng đủ cả 5 repo, nên giữ nguyên full dependency bag
  - `SubmissionService` thực sự dùng `addJob()`, `getQueueLength()`, và `getQueueStatus()`
  - `JudgeQueueService` đã có đủ 3 method đó; không cần adapter nếu `ISubmissionQueueService.addJob()` dùng `Promise<unknown>`
  - Tên method thực tế của `FavoriteService` là:
    - `addFavorite`, `removeFavorite`, `toggleFavorite`
    - `addLessonFavorite`, `removeLessonFavorite`, `toggleLessonFavorite`

## Key Changes

### 1. Chuyển 3 service sang dependency-object constructor

- `ChallengeService` đổi sang:

```ts
new ChallengeService({
  topicRepository,
  problemRepository,
  testcaseRepository,
  solutionRepository,
  lessonRepository,
  solutionApproachRepository,
  submissionRepository,
  favoriteRepository,
});
```

- `FavoriteService` đổi sang:

```ts
new FavoriteService({
  favoriteRepository,
  problemRepository,
  testcaseRepository,
  submissionRepository,
  lessonRepository,
});
```

- `SubmissionService` đổi sang:

```ts
new SubmissionService({
  submissionRepository,
  resultSubmissionRepository,
  testcaseRepository,
  problemRepository,
  userRepository,
  examParticipationRepository,
  examRepository,
  getQueueService,
});
```

- Pattern giữ giống Slice 16:

```ts
constructor(deps: { ... }) {
  this.repo = deps.repo;
}
```

- Unwrap về private fields hiện có; không dùng `this.deps.*` trong toàn class.
- Không đổi logic method, queue payload, mapping, validation, hay error behavior.

### 2. Hoàn tất service factories cho judge flow

- Thêm:

```ts
/** Tạo ChallengeService với concrete repositories. */
export function createChallengeService(): ChallengeService;

/** Tạo FavoriteService với concrete repositories. */
export function createFavoriteService(): FavoriteService;

/** Tạo SubmissionService với concrete repositories và lazy queue accessor. */
export function createSubmissionService(): SubmissionService;
```

- `createSubmissionService()` inject `getJudgeQueueService` trực tiếp qua provider.
- Không dùng adapter wrapper; chọn interface queue tối giản sao cho `JudgeQueueService` satisfy trực tiếp.

### 3. Queue contract colocate trong `submission.service.ts`

- Thêm local contract:

```ts
/** Interface tối giản cho queue dependency của SubmissionService. */
export interface ISubmissionQueueService {
  addJob(job: QueueJob): Promise<unknown>;
  getQueueLength(): Promise<number>;
  getQueueStatus(): Promise<{ length: number; isHealthy: boolean }>;
}
```

- Giữ private helper hiện tại:

```ts
private getQueueService(): ISubmissionQueueService
```

- Constructor inject một provider:

```ts
private readonly queueServiceFactory: () => ISubmissionQueueService
```

- `getQueueService()` chỉ return `this.queueServiceFactory()` để giữ call sites nhỏ nhất.

### 4. Route factories update

- `challenge.routes.ts` dùng `createChallengeService()`
- `favorite.routes.ts` dùng `createFavoriteService()`
- `submission.routes.ts` giữ `createSubmissionService()`, nhưng factory giờ wire đầy đủ dependency
- `SubmissionController` vẫn nhận `getSseService` ở arg thứ hai; không đổi wiring này
- Không đổi route URLs, auth scope, middleware order, rate limit, hay SSE semantics

### 5. Guardrails

- Thêm `check:no-api-judge-service-self-instantiation` vào `check:refactor-guards`
- Scan đúng 3 service files:
  - `challenge.service.ts`
  - `favorite.service.ts`
  - `submission.service.ts`
- Fail nếu còn:
  - `this.* = new *Repository(`
  - `this.* = new *Service(`
  - `await import(`
- Scan 3 route files:
  - `challenge.routes.ts`
  - `favorite.routes.ts`
  - `submission.routes.ts`
- Fail nếu còn direct:
  - `new ChallengeService(`
  - `new FavoriteService(`
  - `new SubmissionService(`
- Exclude `tests/`, `scripts/archive/`, `*.test.ts`, `*.spec.ts`

## Important Interfaces

```ts
export function createChallengeService(): ChallengeService;
export function createFavoriteService(): FavoriteService;
export function createSubmissionService(): SubmissionService;

export interface ISubmissionQueueService {
  addJob(job: QueueJob): Promise<unknown>;
  getQueueLength(): Promise<number>;
  getQueueStatus(): Promise<{ length: number; isHealthy: boolean }>;
}
```

- Không tạo `interfaces/` hay `contracts/` folder mới
- `ISubmissionQueueService` colocate trong `submission.service.ts`

## Test Plan

- Judge-facing service tests giữ cùng khu vực hiện tại: `tests/unit/services`
- `challenge.service.test.ts`
  - update sang injected fake repos
  - giữ coverage hiện có cho testcase display từ JSON
  - thêm factory test cho `createChallengeService()`
- `favorite.service.test.ts`
  - thêm file mới ở `tests/unit/services/favorite.service.test.ts`
  - cover ít nhất:
    - `addFavorite()` dùng đúng injected repos
    - `removeFavorite()` dùng đúng injected repos
    - `addLessonFavorite()` hoặc `toggleLessonFavorite()` để khóa lesson-favorite path
  - thêm factory test cho `createFavoriteService()`
- `submission.service.test.ts`
  - bỏ module mock `getJudgeQueueService`
  - dùng fake `ISubmissionQueueService`
  - giữ coverage queue payload JSON-first
  - assert queue calls đi qua injected provider
  - thêm factory test cho `createSubmissionService()`
- `api-controller-route-composition.test.ts`
  - thêm/update cases cho `challenge`, `favorite`, `submission`
  - verify `createChallengeService()`, `createFavoriteService()`, `createSubmissionService()` được gọi
  - verify `SubmissionController` nhận arg thứ hai đúng là `getSseService`
- Regression:
  - `check:no-api-judge-service-self-instantiation`
  - `check:refactor-guards`
  - `npx tsc -p tsconfig.json --noEmit`
  - focused Jest cho 3 service tests + route composition
  - `npm run test:runtime-open-handles`
  - `npm run build`

## Assumptions

- `ExamService` và `ExamAutoSubmitService` cố ý defer sang slice sau.
- `getJudgeQueueService()` tiếp tục là runtime source of truth; slice này chỉ biến nó thành injected dependency của `SubmissionService`.
- Constructors của `ChallengeService`, `FavoriteService`, và `SubmissionService` vẫn sync sau refactor.
- Không đổi public behavior của controller/service, queue payload, SSE stream behavior, hay judge/runtime contract.
