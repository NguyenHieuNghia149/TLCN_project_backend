# Slice 18: Exam Service DI And Auto-Submit Finalizer Cleanup

## Summary

- Refactor the remaining exam/judge orchestration debt in:
  - `ExamService`
  - `ExamAutoSubmitService`
- Keep behavior unchanged:
  - no HTTP API shape changes
  - no auth, middleware-order, rate-limit, DB/schema, queue, gRPC, or SSE contract changes
- Reuse the existing `INotificationPublisher` from `exam.service.ts`; do not create a duplicate interface.
- Every new function added in this slice must have a short JSDoc note.

## Key Changes

### 1. Convert `ExamService` to dependency-object construction

- Replace constructor self-instantiation with an injected dependency bag:

```ts
new ExamService({
  examRepository,
  examToProblemsRepository,
  examParticipationRepository,
  problemRepository,
  submissionRepository,
  testcaseRepository,
  resultSubmissionRepository,
  userRepository,
  challengeService,
  getNotificationPublisher,
});
```

- Keep the established convention from slices 16-17:
  - dependency keys use full camelCase names
  - private fields keep current names
  - constructor unwraps deps into fields
  - do not use `this.deps.*` through the class
- Remove all constructor-time `new Repository()` / `create*Service()` calls.
- Remove the dynamic import in `getParticipationSubmission()` and use the injected `userRepository`.
- Keep `getNotificationPublisher` lazy and only resolve it in the visible-exam notification path.
- Add:

```ts
/** Creates a fresh ExamService with concrete repositories and default providers. */
export function createExamService(): ExamService;
```

- `createExamService()` wires:
  - concrete exam repositories
  - `createChallengeService()`
  - default notification provider `() => createNotificationService()`
- `createExamService()` must return a fresh instance on each call; no cached singleton behavior.

### 2. Make `ExamAutoSubmitService` a thin finalizer runner

- Remove dead fields:
  - `examParticipationRepository`
  - `examRepository`
- Add colocated contract in `exam-auto-submit.service.ts`:

```ts
/** Defines the finalizer dependency used by ExamAutoSubmitService. */
export interface IExpiredParticipationFinalizer {
  finalizeExpiredParticipations(): Promise<number>;
}
```

- Change constructor to dependency-object form:

```ts
new ExamAutoSubmitService({ examFinalizer });
```

- Keep only these fields:
  - `examFinalizer`
  - `isRunning`
  - `checkInterval`
- `checkAndAutoSubmitExpiredExams()` should only call `examFinalizer.finalizeExpiredParticipations()`.
- Preserve current behavior exactly:
  - `start()` runs once immediately, then schedules interval
  - default interval remains `30000`
  - duplicate `start()` calls do not create duplicate intervals
  - `stop()` clears interval and resets running state
  - `getStatus()` return shape stays unchanged
- Keep zero-arg factory:

```ts
/** Creates an exam auto-submit runner wired to a fresh ExamService finalizer. */
export function createExamAutoSubmitService(): IExamAutoSubmitService;
```

- `createExamAutoSubmitService()` wires `createExamService()` as the finalizer dependency.

### 3. Update composition roots

- Change `exam.routes.ts` from `new ExamService()` to `createExamService()`.
- Keep `ExamController` constructor unchanged.
- Keep `index.ts` startup flow unchanged; it should continue calling `createExamAutoSubmitService()`.
- Do not change route order, validation wiring, or response semantics.

### 4. Guardrail

- Add `check:no-api-exam-orchestration-self-instantiation` and include it in `check:refactor-guards`.
- Scan:
  - `apps/api/src/services/exam.service.ts`
  - `apps/api/src/services/exam-auto-submit.service.ts`
  - `apps/api/src/routes/exam.routes.ts`
- Fail if the service files still contain:
  - `this.* = new *Repository(`
  - `this.* = new *Service(`
  - `this.* = create*Service(`
  - `await import(`
- Fail if `exam.routes.ts` still contains:
  - `new ExamService(`
- Exclude `tests/`, `scripts/archive/`, `*.test.ts`, `*.spec.ts`.

## Important Interfaces

```ts
export interface INotificationPublisher {
  notifyAllUsers(type: string, title: string, message: string, metadata?: unknown): Promise<void>;
}

export function createExamService(): ExamService;

export interface IExpiredParticipationFinalizer {
  finalizeExpiredParticipations(): Promise<number>;
}

export interface IExamAutoSubmitService {
  start(checkIntervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  getStatus(): { isRunning: boolean; checkInterval: number | null };
}

export function createExamAutoSubmitService(): IExamAutoSubmitService;
```

## Test Plan

- Update `tests/unit/api/exam.service.test.ts`:
  - construct `ExamService` with a fake dependency bag
  - keep lazy notification tests
  - verify constructor does not resolve `getNotificationPublisher`
  - add a test that `getParticipationSubmission()` uses injected `userRepository`
  - add a test that `getExamChallenge()` uses injected `challengeService`
  - add a factory test for `createExamService()` that only verifies returned instance type
- Add `tests/unit/api/exam-auto-submit.service.test.ts`:
  - use fake timers
  - verify `start()` calls `finalizeExpiredParticipations()` immediately
  - verify advancing timer triggers subsequent calls
  - verify duplicate `start()` does not duplicate intervals
  - verify `stop()` clears interval and resets status
  - verify `getStatus()` before/after `start()` and `stop()`
  - add a factory test for `createExamAutoSubmitService()` that only verifies interface/instance behavior
  - ensure timer cleanup to avoid open handles
- Update `tests/unit/api/api-controller-route-composition.test.ts`:
  - verify `exam.routes.ts` calls `createExamService()`
  - verify `ExamController` receives the created service instance
- Regression:
  - `check:no-api-exam-orchestration-self-instantiation`
  - `check:refactor-guards`
  - `npx tsc -p tsconfig.json --noEmit`
  - focused Jest for `exam.service.test.ts`, `exam-auto-submit.service.test.ts`, `api-controller-route-composition.test.ts`
  - add `exam-auto-submit.service.test.ts` to `test:runtime-open-handles`
  - `npm run build`

## Assumptions

- `createNotificationService()` remains the default notification provider; deeper `NotificationService` DI cleanup is deferred.
- `AuthService`, `LessonService`, `TopicService`, `UserService`, `LeaderboardService`, and other non-exam services stay out of scope.
- `createExamAutoSubmitService()` remains zero-arg to avoid widening startup/test wiring.
- `createExamService()` is intentionally non-cached.
- This slice remains single-agent; no subagent is needed.
