# Slice 7: Eliminate Remaining Cross-App Imports

## Summary

Debt còn lại rõ nhất sau slice 6: worker và sandbox vẫn import thẳng từ app API. Slice này refactor boundary để:

- `apps/worker` không còn import `@backend/api/services/*`
- `apps/sandbox` không còn import `@backend/api/services/*`
- Queue/job contract, queue publisher, security scanning, và submission finalization đi qua shared modules

**Không có DB schema change, không có HTTP API change, không đổi judge behavior.**

Slice này lớn hơn các slice trước vì đụng nhiều concerns độc lập. Rủi ro cao nhất là submission finalization — đây là logic có advisory lock, transaction, và ranking semantics phức tạp. Cần có integration test baseline trước khi move code.

---

## Preconditions

```
Slice 6 đã hoàn thành và ổn định

Submission finalization baseline:
→ integration tests cover đủ 4 behaviors (xem mục Key Changes 3)
   đã pass với implementation hiện tại TRƯỚC khi refactor
→ đây là gate bắt buộc — không move finalization code nếu chưa có test baseline

Exam scheduler verify:
→ compare logs của API examAutoSubmitService và worker finalizer interval
   trong production hoặc staging
→ confirm chúng xử lý cùng set expired exam (true duplicate)
→ không tiếp tục xóa worker interval nếu có dấu hiệu chúng complementary

securityService / monitoringService:
→ confirm sandbox và API là separate processes (không share runtime state)
→ nếu có shared in-memory state thì cần strategy riêng trước khi move
```

---

## Deploy Order

Shared queue service dùng cùng Redis URL và channel names — không có wire format change. Do đó API mới và worker mới có thể deploy theo thứ tự bất kỳ mà không tạo mismatch.

```
1. Deploy shared package (contracts, queue service, finalization helper, security/monitoring)

2. Deploy API mới (dùng shared queue service, xóa hoặc re-export queue.service.ts)

3. Deploy worker mới (bỏ API imports, dùng shared finalization helper)
   → sau bước này worker không còn chạy exam finalizer interval

4. Deploy sandbox mới (bỏ API imports, dùng shared security/monitoring service)

5. Smoke test: cpp, java, python
   → accepted / wrong answer / compile error / runtime error
   → submit 1 bài trong exam context để verify finalization vẫn đúng

6. Monitor
   → submission finalization writes result rows đúng
   → ranking/score không có anomaly
   → expired exam finalization vẫn chạy từ API (worker không còn chạy duplicate)
   → không còn @backend/api import errors trong worker/sandbox logs
```

Nếu bất kỳ bước nào fail: rollback code của component đó về slice 6. Không có data rollback.

---

## Key Changes

### 1. Extract shared runtime contracts và services

**Queue contract** — tạo shared module:

- `QueueJob`
- `QueueJobTestcase`

**Queue service** — chuyển Redis/BullMQ queue service ra shared package:

- API và worker cùng import một `shared judgeQueueService`
- Bỏ dependency của worker vào `apps/api/src/services/queue.service.ts`
- Shared service dùng cùng Redis URL và channel names — không cần rollout/data migration
- Mỗi app (API, worker) vẫn cần configure Redis URL riêng trong app context của mình; shared package chỉ là shared code, không shared config

**`apps/api/src/services/queue.service.ts`** — xóa file này sau khi API đã import trực tiếp từ shared package. Không giữ lại dưới dạng re-export wrapper.

**Security và monitoring services** — chuyển ra shared package:

- Sandbox import shared service thay vì API
- API controllers/routes cũng import shared service
- Vì sandbox và API là separate processes, shared package là shared code — không có shared in-memory state issue (đã verify ở preconditions)

### 2. Remove worker dependencies on API services

Worker không còn import:

- `submissionService`
- `queueService`
- `ExamService`

Worker publish SSE/update events qua shared queue publisher, không qua API service wrapper.

**Xóa exam finalizer interval khỏi worker** — sau khi đã verify ở preconditions rằng API `examAutoSubmitService` là scheduler duy nhất cần chạy. API trở thành nơi duy nhất chạy expired-exam finalization.

### 3. Submission finalization — refactor với test baseline bắt buộc

**Trước khi move bất kỳ code nào**, viết integration tests cover đủ 4 behaviors của `SubmissionRepository.finalizeSubmissionResult(...)`:

1. Advisory lock cho ranking — concurrent finalization calls không corrupt rank
2. First-accepted rank point awarding — chỉ submission đầu tiên accepted nhận point
3. Delete + recreate result submissions trong cùng transaction — không để orphan rows
4. Idempotent status update — gọi nhiều lần với cùng input cho ra cùng kết quả

Tests phải pass với implementation hiện tại. Sau khi tách thành shared helper, chạy lại cùng test suite — nếu có test nào fail thì không merge.

**Shared helper interface:**

```ts
// Input
{
  submissionId: string;
  status: ESubmissionStatus;
  result: SubmissionResult;
  judgedAt?: string;
}

// Output
{ id: string; status: string } | null
```

Helper giữ nguyên transaction semantics: advisory lock, first-accepted logic, delete + recreate pattern, idempotent update — không được simplify hay optimize trong cùng slice này.

### 4. Grep gate cho cross-app imports

Thêm CI grep gate chạy tự động, fail nếu tìm thấy các pattern sau:

```
Trong apps/worker/**:
  @backend/api/services
  @backend/api/repositories

Trong apps/sandbox/**:
  @backend/api/services
```

Loại trừ: `tests/`, `scripts/archive/`, `*.test.ts`, `*.spec.ts`.

Gate này join với các gate từ slice trước (`check:no-execution-mode-refs`, text-cache gate) thành một CI step duy nhất.

---

## Important Interfaces

**Shared queue payload — source of truth duy nhất cho API + worker:**

```ts
{
  submissionId: string;
  userId: string;
  problemId: string;
  code: string;
  language: string;
  functionSignature: AST;
  testcases: Array<{
    id: string;
    inputJson: Record<string, unknown>;
    outputJson: unknown;
    point: number;
    isPublic?: boolean;
  }>;
  timeLimit: number;
  memoryLimit: string;
  createdAt: string;
  jobType?: 'SUBMISSION' | 'RUN_CODE';
}
```

**Shared finalization helper:**

```ts
finalizeSubmissionResult(input: {
  submissionId: string;
  status: ESubmissionStatus;
  result: SubmissionResult;
  judgedAt?: string;
}): Promise<{ id: string; status: string } | null>
```

---

## Test Plan

### Submission finalization baseline (bắt buộc trước khi refactor)

- Advisory lock: concurrent calls không corrupt rank
- First-accepted: chỉ submission đầu tiên accepted nhận rank point
- Transaction: delete + recreate không để orphan rows khi có lỗi giữa chừng
- Idempotent: gọi nhiều lần với cùng input → cùng kết quả

Chạy với implementation cũ → pass. Chạy với shared helper mới → phải pass giống hệt.

### Type / build

- Worker và sandbox compile với 0 `@backend/api/services/*` imports
- API compile với shared queue/security/finalization modules
- Grep gate pass: 0 cross-app import ngoài scope loại trừ

### Regression

- `cpp`, `java`, `python`: accepted / wrong answer / compile error / runtime error không đổi
- Submission finalization vẫn ghi đúng result rows và score/rank behavior
- Exam trong context submit: finalization chạy đúng, kết quả khớp với behavior trước slice

### Scheduler behavior

- Chỉ API chạy exam auto-submit sau slice này
- Worker không còn start duplicate finalizer interval
- Verify bằng log: sau deploy worker mới, không còn log từ worker finalizer interval; API vẫn log expired-exam finalization

### Guardrails

- Grep gate cho cross-app imports pass
- `check:no-execution-mode-refs` và text-cache gate vẫn pass

### Definition of Done

- 0 `@backend/api/services/*` import trong worker và sandbox
- `apps/api/src/services/queue.service.ts` đã bị xóa
- Submission finalization integration tests pass với shared helper
- Worker không còn exam finalizer interval trong logs

---

## Assumptions

- `examAutoSubmitService` trong API là canonical expired-exam scheduler — đã verify qua log comparison ở preconditions. Xóa worker interval là safe.
- Shared queue service dùng cùng Redis URL và channel names — không cần rollout hay data migration.
- Sandbox và API là separate processes — shared security/monitoring package là shared code, không shared in-memory state.
- Shared finalization helper phải giữ nguyên transaction semantics hiện tại; không optimize hay simplify trong slice này.
- Không có HTTP response shape change, không có DB schema change.
