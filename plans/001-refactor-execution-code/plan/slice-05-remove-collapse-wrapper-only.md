# Slice 5: Collapse Wrapper-Only Runtime Contract

## Summary

Sau slice 4, storage đã JSON-only. Debt lớn còn lại là `executionMode`/`execution_mode` vẫn đi qua queue, validation, worker, sandbox và gRPC dù hệ thống chỉ còn đúng một mode là wrapper.

Slice này dọn runtime contract nội bộ và chuyển wire contract sang two-phase compatibility:

- Nội bộ không còn `executionMode`
- Trên gRPC, sandbox tạm thời chấp nhận cả `missing` và `"wrapper"`
- Proto field chỉ bị xóa ở slice sau, sau khi rollout ổn định

**Không có DB migration trong slice này.**

---

## Preconditions

```
Slice 4 đã hoàn thành:
- npm run audit:post-drop exit 0
- testcases.input / testcases.output đã bị drop
- CI grep gate pass
```

---

## Deploy Order (bắt buộc tuân thủ)

```
1. Deploy sandbox mới (compatibility-first)
   → chấp nhận execution_mode: "wrapper" và execution_mode missing
   → reject giá trị khác với gRPC INVALID_ARGUMENT

2. Smoke test mixed state: sandbox mới + worker cũ
   → submit 1 bài cpp, 1 java, 1 python
   → nếu fail: rollback sandbox, dừng — không tiếp tục

3. Deploy worker/API mới
   → không còn gửi execution_mode trên gRPC request
   → không còn set executionMode trong QueueJob

4. Monitor 1 vòng release
   → verify không còn INVALID_ARGUMENT error từ sandbox
   → verify submission flow hoạt động bình thường

5. Slice sau: xóa execution_mode khỏi proto/wire hoàn toàn
```

Bước 2 là smoke test bắt buộc — không được bỏ qua, đây là lúc duy nhất có thể phát hiện mixed deploy issue trước khi worker mới được rollout.

---

## Key Changes

### 1. Internal runtime contract cleanup

Bỏ `executionMode` khỏi:

- `QueueJob` / `QueueJobTestcase` contract
- Shared `ExecutionConfig`
- Các validation/type nội bộ liên quan đến sandbox execution

`submission.service` và `queue.service` không còn set `executionMode: 'wrapper'`. `worker.service` không còn branch/check `job.executionMode` — wrapper mode là implicit default duy nhất.

Worker vẫn generate wrapper và gửi structured testcase như hiện tại; chỉ bỏ field constant thừa.

`ExecutionConfig.testcases[].input` và `.output` là derived từ `inputJson`/`outputJson` qua `buildTestcaseDisplay` — không đọc từ DB (columns đã bị drop ở slice 4).

### 2. Two-phase gRPC compatibility

Trong slice này, **không xóa field khỏi proto**.

Sandbox behavior mới:

- Chấp nhận `execution_mode === "wrapper"` → proceed
- Chấp nhận `execution_mode` bị thiếu (missing/unset) → proceed, treat as wrapper
- Reject mọi giá trị khác → trả gRPC `INVALID_ARGUMENT` với message: `"execution_mode must be 'wrapper' or unset; got: <value>"`, log error với giá trị nhận được

Worker gRPC client ngừng gửi `execution_mode` trên request mới. `sandbox.proto` và `GrpcExecutionRequest` giữ field thêm một pass để mixed deploy an toàn.

### 3. Operational / documentation cleanup

- `FUNCTION_SIGNATURE_JUDGE_MODE.md` cập nhật phần runtime contract:
  - Wrapper là default duy nhất
  - `execution_mode` đang ở compatibility phase, không còn là behavior toggle
  - `audit:post-drop` là audit chính cho storage state sau slice 4
- `audit:post-migration` (từ slice 2–3): move sang `scripts/archive/` và xóa khỏi `package.json` — không còn là active script.
- Perf harness `challenge_detail_*` giữ nguyên; docs được sửa để nói rõ đây là staging measurement tool, không phải CI blocker.

---

## Important Interfaces

**Internal queue payload sau slice này:**

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
  // executionMode đã bị xóa
}
```

**Shared execution config sau slice này:**

```ts
{
  code: string;
  language: string;
  testcases: Array<{
    id: string;
    input: string; // derived từ inputJson qua buildTestcaseDisplay
    output: string; // derived từ outputJson qua buildTestcaseDisplay
    point: number;
  }>;
  timeLimit: number;
  memoryLimit: string;
  // executionMode đã bị xóa
}
```

**gRPC wire contract trong slice này:**

```
execution_mode vẫn tồn tại trên proto (chưa xóa)
worker mới: không gửi field
sandbox mới: chấp nhận missing hoặc "wrapper", reject giá trị khác
```

---

## Test Plan

### Unit tests

- `QueueJob`/`ExecutionConfig` không còn field `executionMode` — typecheck fail nếu ai đó thêm lại
- `submission.service` không đưa `executionMode` vào job payload
- `worker.service` không còn branch/check `job.executionMode`
- `ExecutionConfig.testcases[].input`/`.output` được derive từ `buildTestcaseDisplay`, không từ DB read

### Sandbox compatibility tests

- Request có `execution_mode: "wrapper"`: pass, proceed bình thường
- Request thiếu `execution_mode` (unset/missing): pass, treat as wrapper
- Request có `execution_mode: "legacy"`: reject với gRPC `INVALID_ARGUMENT`, message chứa `"legacy"`
- Request có `execution_mode: ""` (empty string): reject với gRPC `INVALID_ARGUMENT`
- Request có `execution_mode: null`: reject với gRPC `INVALID_ARGUMENT`

### Mixed deploy safety

- Sandbox mới + worker cũ (gửi `execution_mode: "wrapper"`): pass — verify bằng smoke test ở bước 2 deploy order
- Sandbox mới + worker mới (không gửi `execution_mode`): pass
- Deploy order docs nêu rõ: không deploy worker mới trước sandbox mới

### Regression

- `cpp`, `java`, `python`: accepted / wrong answer / compile error / runtime error không đổi
- `npm run check:no-testcase-text-cache-refs`, typecheck, build, focused unit tests vẫn pass

---

## Assumptions

- Two-phase compatibility cho `execution_mode` được chọn thay vì xóa ngay để đảm bảo mixed deploy an toàn.
- Slice này không đụng DB schema và không thay đổi API response shape.
- Perf harness placeholder `challengeId` (fixture problem ID dùng trong perf script) là ops detail chưa được điền — không phải blocker cho slice này, sẽ được resolve trong ops cleanup tiếp theo.
- Slice sau mới là nơi xóa hẳn `execution_mode` khỏi `sandbox.proto`, gRPC client/server types, và docs compatibility wording.
- `audit:post-migration` không còn được dùng trong active rollout sau slice 3 — move sang archive là safe.
