# Slice 12: API Bootstrap Factories And Import-Safe Startup

## Summary

Mirror sandbox/worker bootstrap cleanup cho API, nhưng dừng ở bootstrap only.

Mục tiêu: `apps/api/src/index.ts` trở thành import-safe:

- Không top-level `config()`
- Không top-level `express()` / `createServer()`
- Không top-level `startServer()`
- Không top-level DB connect/migrations, queue warmup, watchdog, websocket init, hay exam scheduler start

Route/controller modules và API service singletons giữ nguyên thêm một slice — slice này chỉ đảm bảo chúng được load lazily từ startup/factory code, không chạy khi `index.ts` được import.

**Không đổi DB/schema, HTTP API shape, gRPC/runtime contract, queue payload.**

Monorepo deploy atomic — không cần tách giai đoạn.

---

## Preconditions

```
Slice 11 đã hoàn thành:
→ check:refactor-guards pass (bao gồm worker singleton gate)
→ open handle CI step pass không cần --forceExit

Xác nhận trước khi implement:
→ apps/api/src/index.ts hiện có hay không có SIGTERM/SIGINT handlers?
   Nếu có: cần move vào startApiServer() (xem Key Changes 1)
   Nếu không: note rõ trong plan để người đọc không thắc mắc
→ examAutoSubmitService là singleton import hay lazy getter?
   Nếu singleton import: phải load bằng lazy require() trong startApiServer()
   không phải top-level import trong index.ts
```

---

## Key Changes

### 1. API entrypoint thành factory-based

`apps/api/src/index.ts`:

```ts
export function createApiApp(): express.Express;
export async function startApiServer(): Promise<{
  app: express.Express;
  server: Server;
}>;
```

**`createApiApp()`:**

- Tạo Express app
- Đăng ký middleware, `/uploads`, normal API routes, 404 handler, error middleware
- Không tạo HTTP server
- Không connect DB, queue, websocket, watchdog, hay exam scheduler

**`startApiServer()` — thứ tự bắt buộc:**

```
1.  config()
2.  const app = createApiApp()
3.  const server = createServer(app)
4.  await DatabaseService.connect()
5.  await DatabaseService.runMigrations()
6.  initialize WebSocket với server instance đó
7.  start examAutoSubmitService   ← load lazily, không phải top-level import
8.  getJudgeQueueService().connect()   ← lazy getter từ slice 9, fire-and-forget
9.  initialize watchdog cron
10. mount /admin/queues via createAdminRouter()
11. server.listen(...)
12. register SIGTERM/SIGINT handlers (nếu API có signal handlers)
```

**Lưu ý về signal handlers:** nếu `index.ts` hiện có top-level `process.on('SIGTERM', ...)`, move vào `startApiServer()` ở bước 12. Test `api.server.test.ts` phải có `afterAll(() => process.removeAllListeners('SIGTERM', 'SIGINT'))`.

Giữ entrypoint path và scripts hiện tại:

```ts
if (require.main === module) {
  void startApiServer().catch(error => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}
```

### 2. Lazy-load startup-only modules

`index.ts` không còn import các module sau ở top-level:

- `./routes`
- `./routes/admin`
- `./cron/watchdog`
- `./services/exam-auto-submit.service`
- `./services/websocket.service`

**Approach:** dùng synchronous `require()` bên trong factory functions thay vì top-level import — đây là deliberate temporary pattern để không mở rộng scope sang route/controller refactors. Pattern này sẽ được cleanup khi route/controller factories được làm ở slice sau.

**Lưu ý TypeScript:** với `require()` trong `.ts` file, cần type assertion để preserve type safety:

```ts
// Trong createApiApp():
const { registerRoutes } = require('./routes') as typeof import('./routes');

// Trong startApiServer():
const { createAdminRouter } = require('./routes/admin') as typeof import('./routes/admin');
const { watchdog } = require('./cron/watchdog') as typeof import('./cron/watchdog');
const { examAutoSubmitService } =
  require('./services/exam-auto-submit.service') as typeof import('./services/exam-auto-submit.service');
```

Nếu route modules không có top-level side effects thì static import ở top-level là fine và cleaner hơn — verify trước khi implement. Nếu không có side effects, ưu tiên static import.

### 3. Scope giới hạn — out of scope

- Route/controller factory conversion
- Removing `submissionService`, `notificationService`, `sseService`, hay `examAutoSubmitService` singletons
- API graceful shutdown behavior mới

Behavior hiện tại giữ nguyên sau khi `startApiServer()` được gọi; chỉ import-time behavior thay đổi.

### 4. Guardrails

Thêm `check:no-api-bootstrap-side-effects` vào `check:refactor-guards`. Chỉ scan `apps/api/src/index.ts`. Fail nếu tìm thấy:

```
top-level:
  config(
  const app = express(
  const server = createServer(
  startServer()
  startApiServer()   (ngoài require.main guard)

top-level imports of:
  ./routes
  ./routes/admin
  ./cron/watchdog
  ./services/exam-auto-submit.service
  ./services/websocket.service
```

Gate chạy tự động trong CI cùng với các gate từ các slice trước.

---

## Important Interfaces

```ts
export function createApiApp(): express.Express;

export async function startApiServer(): Promise<{
  app: express.Express;
  server: Server;
}>;
```

**Không đổi:**

- HTTP API shapes
- Queue payloads
- DB schema
- gRPC/runtime contracts
- Route/controller/service public behavior sau startup

---

## Test Plan

### Import safety

- Import `apps/api/src/index.ts`: không gọi `dotenv.config()`
- Không tạo HTTP server hay gọi `listen()`
- Không connect DB hay run migrations
- Không initialize WebSocket, queue warmup, watchdog, hay exam scheduler
- Nếu có signal handlers: `process.listenerCount('SIGTERM') === 0` sau import

### App factory

`api.server.test.ts`:

- `createApiApp()` trả Express app testable với `supertest`
- Unknown `/api/*` path trả đúng JSON 404 shape hiện tại
- `createAdminRouter()` không được gọi bên trong `createApiApp()` — verify bằng mock

### Startup wiring

- Mock DB, queue, websocket, watchdog, admin router, exam scheduler
- `startApiServer()` gọi đúng thứ tự: connect → migrate → websocket → exam scheduler → queue warmup → watchdog → admin → listen
- Mỗi hook được gọi đúng một lần
- **Bắt buộc:** mock `server.listen()` hoặc gọi `server.close()` trong `afterAll` — nếu không thì sẽ có open handle vi phạm mục tiêu chuỗi refactor
- `afterAll(() => process.removeAllListeners(...))` nếu signal handlers được đăng ký

### Regression

- `check:no-api-bootstrap-side-effects` pass
- `check:refactor-guards`, typecheck, build, `test:runtime-open-handles` vẫn pass

### Definition of Done

- Import `apps/api/src/index.ts` không trigger bất kỳ side effect nào
- `createApiApp()` có thể test với supertest mà không cần DB/Redis
- `startApiServer()` test mock `server.listen()` hoặc close trong `afterAll`
- Gate `check:no-api-bootstrap-side-effects` pass trong CI

---

## Assumptions

- `apps/api/src/index.ts` vẫn là API entrypoint; không đổi package script path.
- Route/controller top-level instantiation intentionally left for later slice; lazy-load route registrar là đủ cho import-safety goal của slice này.
- `createAdminRouter()` mount trong `startApiServer()`, không trong `createApiApp()` — tránh queue side effects trong plain app-factory tests.
- Queue warmup giữ non-blocking với logging semantics hiện tại; slice này không thay đổi readiness behavior.
- `getJudgeQueueService()` lazy getter đã available từ slice 9 — không cần import path mới.
- Nếu route modules không có top-level side effects, ưu tiên static import thay vì `require()` — verify trước khi implement.
