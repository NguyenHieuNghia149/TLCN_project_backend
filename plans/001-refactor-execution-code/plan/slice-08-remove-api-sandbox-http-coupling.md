# Slice 8: Remove Remaining API↔Sandbox HTTP Coupling

## Summary

Sau slice 7, coupling app-to-app còn sót lại nằm ở HTTP layer:

- API vẫn mount `sandboxRoutes` từ app sandbox
- Sandbox vẫn import `rateLimitMiddleware` từ app API
- Worker/sandbox `tsconfig` vẫn còn alias `@backend/api/*`

Hướng đã chọn: **API ngừng phục vụ `/api/sandbox`**. Sandbox app tiếp tục giữ các HTTP endpoints `/api/sandbox/*` cho ops/debug — runtime judge vẫn đi qua gRPC như hiện tại. Không thêm proxy trong API vì HTTP surface của sandbox chỉ phục vụ ops/debug, không phải runtime path.

**Slice này là code-only cleanup. Không có DB migration, không đổi gRPC contract, không đổi judge behavior.**

---

## Preconditions

```
Slice 7 đã hoàn thành:
→ grep gate cross-app imports pass: 0 @backend/api/services/* trong worker/sandbox
→ đây là điều kiện để xóa tsconfig alias an toàn

Access log check:
→ kiểm tra access log của API app trong 30 ngày gần nhất
→ xác nhận không có request thực tế nào đến /api/sandbox/* qua API app
→ nếu có: xác định nguồn trước khi proceed
   (nếu là external consumer thì cần compatibility slice riêng trước)

rateLimitMiddleware config check:
→ xác nhận sandbox hiện dùng in-memory store hay Redis cho rate limiting
→ nếu Redis: confirm sandbox đã có Redis connection riêng
→ thông tin này quyết định cách shared module nhận config (xem Key Changes 1)
```

---

## Deploy Order

```
1. Deploy shared package (rate-limit helper)
   → API và sandbox đều có thể import trước khi code mới được deploy

2. Deploy API mới (bỏ sandboxRoutes mount, import rate-limit từ shared)
   → /api/sandbox/* bắt đầu trả 404 từ API app
   → sandbox service vẫn serve /api/sandbox/* độc lập

3. Deploy sandbox mới (bỏ @backend/api/* import, import rate-limit từ shared)

4. Smoke test
   → sandbox service: /api/sandbox/health, /api/sandbox/status pass
   → API app: /api/sandbox/* trả 404
   → judge flow: cpp, java, python accepted / wrong answer / compile error

5. Monitor
   → không có unexpected 404 từ consumer nào
   → sandbox HTTP endpoints vẫn accessible trực tiếp
```

Không có data rollback. Nếu fail: rollback code component đó về slice 7.

---

## Key Changes

### 1. Extract shared HTTP rate-limit helper

Tạo `packages/shared/http/rate-limit.ts`:

```ts
// Stateless factory — mỗi app tự inject config
rateLimitMiddleware(options: RateLimitOptions): RequestHandler
```

Nếu rate limiter cần store (in-memory hoặc Redis): helper nhận store config qua `options`, không hardcode. API và sandbox tự configure store riêng phù hợp với infrastructure của từng app — shared package chỉ là shared code, không shared store instance.

Các limiter cụ thể (`generalLimiter`, `strictLimiter`, `authLimiter`) được tạo trong từng app dùng factory này, không export sẵn từ shared package.

API routes và sandbox routes cùng import từ shared HTTP module. Không để sandbox còn import bất kỳ middleware nào từ `@backend/api/*`.

### 2. Remove API-mounted sandbox routes

- Xóa import `@backend/sandbox/sandbox.routes` khỏi API route registry
- Xóa `app.use('/api/sandbox', sandboxRoutes)` khỏi API
- Xóa alias `@backend/sandbox/*` khỏi `apps/api/tsconfig.json`

Giữ nguyên sandbox standalone HTTP server với các endpoints:

- `/api/sandbox/execute`
- `/api/sandbox/status`
- `/api/sandbox/health`
- `/api/sandbox/test`

### 3. Lock boundary trong tsconfig và CI

Xóa alias `@backend/api/*` khỏi:

- `apps/worker/tsconfig.json`
- `apps/sandbox/tsconfig.json`

Việc xóa alias sẽ làm build fail ngay nếu còn import gián tiếp nào sót — đây là fail-fast intended behavior. Precondition slice 7 grep gate pass đảm bảo không còn import trực tiếp; xóa alias là bước cuối để enforce ở build level.

Mở rộng CI grep gate (join với gate từ các slice trước):

```
Trong apps/worker/**, apps/sandbox/**:
  @backend/api/*     → fail

Trong apps/api/**:
  @backend/sandbox/* → fail

Loại trừ: tests/, scripts/archive/, *.test.ts, *.spec.ts, migrations/
```

### 4. Update docs và local tooling

- Cập nhật docs đang nói `/api/sandbox` như API-mounted route: route này thuộc sandbox service, không thuộc API app
- Cập nhật script/test harness nội bộ còn hardcode `/api/sandbox` qua API host → trỏ sang sandbox service host/port
- Không đổi nội dung runtime judge flow; chỉ đổi ownership của HTTP surface

---

## Important Interfaces

**Public compatibility decision của slice này:**

- API app không còn serve `/api/sandbox/*` — trả `404`
- Sandbox app tiếp tục serve `/api/sandbox/*` trực tiếp

**Shared helper mới:**

```ts
// packages/shared/http/rate-limit.ts
rateLimitMiddleware(options: RateLimitOptions): RequestHandler
```

**Không đổi:**

- Queue payload
- gRPC request/response
- Submission/result schema
- DB schema

---

## Test Plan

### Build / type

- API, worker, sandbox đều compile sau khi bỏ alias cross-app
- Shared HTTP helper resolve đúng ở cả API và sandbox
- Typecheck fail nếu bất kỳ file nào trong worker/sandbox còn import `@backend/api/*`

### Shared rate-limit helper

- Unit test: `rateLimitMiddleware(options)` trả đúng `RequestHandler`
- Unit test: limiter reject request vượt threshold theo config
- Import từ shared package trong cả API và sandbox context không có lỗi resolve

### Boundary guards

- Grep gate pass: `0` import `@backend/api/*` trong worker/sandbox
- Grep gate pass: `0` import `@backend/sandbox/*` trong API
- Gate từ các slice trước (`check:no-execution-mode-refs`, text-cache, cross-app services) vẫn pass

### HTTP behavior

- Sandbox service: `/api/sandbox/health`, `/api/sandbox/status`, `/api/sandbox/execute`, `/api/sandbox/test` vẫn respond đúng
- API app: `/api/sandbox/*` trả `404` — verify bằng integration test HTTP call thật vào API host

### Regression

- Judge flow: `cpp`, `java`, `python` — accepted / wrong answer / compile error / runtime error không đổi
- gRPC worker→sandbox path không đổi

### Definition of Done

- `0` cross-app imports trong worker, sandbox, API (tsconfig alias đã xóa, grep gate pass)
- `/api/sandbox/*` trả `404` từ API app — có integration test confirm
- Docs không còn mô tả `/api/sandbox` như API-owned surface
- Local test scripts trỏ đúng sang sandbox service host

---

## Assumptions

- Không có consumer thực tế đang gọi `/api/sandbox` qua API app — đã verify qua access log ở preconditions. Nếu sau này phát hiện cần giữ route cho external caller, sẽ làm compatibility proxy slice riêng.
- `rateLimitMiddleware` là stateless factory nhận options — không cần shared store instance giữa API và sandbox.
- Sandbox HTTP endpoints vẫn cần giữ cho ops/debug trong slice này; chưa xóa HTTP server của sandbox.
- Không có DB schema change, không có gRPC contract change, không có HTTP API shape change ngoài việc API app drop `/api/sandbox/*`.
