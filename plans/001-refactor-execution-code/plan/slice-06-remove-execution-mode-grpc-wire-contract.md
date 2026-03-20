# Slice 6: Remove execution_mode From The gRPC Wire Contract

## Summary

Slice 5 đã dọn xong internal contract; debt còn lại chỉ là `execution_mode` trên proto/wire và phần docs/tests compatibility. Slice này xóa hẳn field đó khỏi gRPC contract.

**Không có DB migration. Không có API change.**

Đây là slice cleanup thuần túy — rủi ro thấp nhất trong chuỗi refactor.

---

## Preconditions

```
Slice 5 đã chạy ổn định qua ít nhất 1 vòng release
Không còn INVALID_ARGUMENT liên quan tới execution_mode trong logs
Worker mới đã được rollout đầy đủ — thực tế không còn gửi field này
```

---

## Deploy Order

Deploy sandbox + worker/API từ cùng slice này trong một lần — không cần tách 2 giai đoạn.

Lý do: worker đã không gửi `execution_mode` từ slice 5, nên sandbox mới (không còn validate field) và worker mới (đã clean type) không tạo ra window nguy hiểm khi deploy cùng lúc.

```
1. Deploy sandbox + worker/API

2. Smoke test: cpp, java, python
   → accepted / wrong answer / compile error / runtime error

3. Monitor gRPC error rate và submission flow

4. Nếu có lỗi wire-compat bất ngờ: rollback về code slice 5
   → sandbox slice 5 accept execution_mode missing → safe với worker mới
   → không rollback về sandbox cũ hơn slice 5
   → không có data rollback nào cần xử lý
```

---

## Key Changes

### 1. Proto và gRPC types

Verify field number của `execution_mode` trong proto hiện tại trước khi viết `reserved` statement. Sau khi confirm:

```protobuf
reserved 7;                // thay bằng field number thực tế
reserved "execution_mode";
```

Xóa field `execution_mode` khỏi `client.ts` và mọi request type liên quan.

### 2. Sandbox server cleanup

- Xóa `validateWrapperExecutionMode(...)` khỏi `server.ts`.
- Không còn branch reject mode; server xử lý request như wrapper-only mặc định.
- `sandbox.service.ts` giữ nguyên behavior — runtime đã wrapper-only từ slice 5.
- Xóa test compatibility cũ trong `grpc.server.test.ts` — behavior wrapper-only không cần test riêng cho mode validation nữa. Thêm một test đơn giản: request không có `execution_mode` được xử lý đúng end-to-end.

### 3. Worker cleanup

- `worker.service.ts` đã omit field từ slice 5; slice này chỉ xóa type imports và comments còn sót.
- Health probe tiếp tục chạy không có `execution_mode`.

### 4. Grep gate

Mở rộng hoặc thêm CI grep gate chạy tự động, fail nếu tìm thấy `execution_mode` hoặc `executionMode` ngoài scope loại trừ:

```
Loại trừ: scripts/archive/, docs/, *.md, migrations/
Pattern:  execution_mode, executionMode
```

Gate này chạy trong CI — không phải manual check.

### 5. Docs

Cập nhật `FUNCTION_SIGNATURE_JUDGE_MODE.md`:

- Bỏ wording "compatibility phase"
- Ghi rõ gRPC contract không còn `execution_mode`
- Wrapper là sole execution mode, không có toggle

---

## Important Interfaces

**gRPC request sau slice này:**

```ts
{
  submission_id: string;
  source_code: string;
  language: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  test_cases: Array<{
    id: string;
    input: string;
    expected_output: string;
  }>;
  // execution_mode đã bị xóa và reserved
}
```

---

## Test Plan

### Typecheck / build

- Typecheck fail nếu ai đó còn dùng `execution_mode` trên `GrpcExecutionRequest`
- Build pass sau khi xóa field và update types

### gRPC contract

- Request không có `execution_mode`: xử lý đúng, không error
- gRPC health check trả `SERVING`

### Regression

- `cpp`, `java`, `python`: accepted / wrong answer / compile error / runtime error không đổi
- Unit tests hiện có cho worker/sandbox vẫn pass

### Grep gate (CI)

- `rg -n "execution_mode|executionMode"` trong source (ngoài `scripts/archive/`, `docs/`, `*.md`, `migrations/`): 0 match

### Definition of Done

- `reserved` statement đã được thêm vào proto với đúng field number
- Grep gate CI pass
- Docs đã cập nhật: không còn wording "compatibility phase"

---

## Assumptions

- Không còn mixed deploy với worker cũ gửi `execution_mode` — đã confirm qua monitoring sau slice 5.
- Proto field number của `execution_mode` cần được verify trong file proto hiện tại trước khi viết `reserved`; plan assume là 7 nhưng phải confirm.
- Rollback an toàn về sandbox slice 5 (không về cũ hơn) vì slice 5 đã accept missing field.
- Slice này không đổi HTTP API và không đổi DB/schema.
