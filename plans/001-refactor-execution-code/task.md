# TASK TRACKER: REFACTOR EXECUTION CODE V2.0

Tiến độ thực thi 5 Phase tái cấu trúc hệ thống:

## Phase 1: Nâng cấp Client-Server & Bảo mật Gateway

- [ ] **1.1.** Cài đặt middleware API Rate Limiting (VD: 1 submit / 5 giây) ở `SubmissionController` hoặc qua Nginx.
- [ ] **1.2.** Tạo endpoint SSE `GET /api/v1/submissions/stream/:id` để Frontend subscribe. Đảm bảo đọc JWT qua Query Params `?token=...`.
- [ ] **1.3.** Đảm bảo connection SSE tự đóng lại (`end()`) khi nhận status cuối (ACCEPTED/WA/TLE...).
- [ ] **1.4.** Refactor luồng Pub/Sub: API Server lắng nghe và phát tín hiệu qua SSE thay vì WebSocket cho luồng Code Status.
- [ ] **1.5.** Cập nhật `docker/nginx.conf` thêm lệnh `proxy_buffering off;` cho path `/stream`.

## Phase 2: Áp dụng Message Queue & Tính Lũy Đẳng (BullMQ)

- [ ] **2.1.** Cài đặt thư viện `bullmq` thay cho Redis Queue tự làm của dự án. Khởi tạo hàng đợi `submission_queue`.
- [ ] **2.2.** 2.2. Cấu hình Worker BullMQ với policy attempts: 3, lockDuration: 30s, stalledInterval: 15s. Cấu hình thêm removeOnComplete: true để dọn RAM sau khi hoàn thành.
- [ ] **2.3.** Viết lại hàm `updateSubmissionResult`: áp dụng Idempotency với điều kiện SQL `WHERE status IN ('PENDING', 'RUNNING')`. Dừng ghi log `RUNNING` xuống Database, chỉ set in-memory Cache (Redis).
- [ ] **2.4.** Lắng nghe sự kiện Graceful Shutdown (`SIGTERM`, `SIGINT`) tắt Worker mượt mà.
- [ ] **2.5.** Bắt sự kiện worker.on('failed', ...) của BullMQ. Khi một job cạn sạch 3 lần retry, BẮT BUỘC gọi hàm Update Database chuyển status của submissionId đó thành SYSTEM_ERROR hoặc INTERNAL_ERROR để Watchdog ở Phase 5 bỏ qua nó

## Phase 3: Chuyển đổi gRPC & Bảo vệ Mạch (Circuit Breaker)

- [ ] **3.1.** Viết file schema gRPC `sandbox.proto` ở packet thư mục chung.
- [ ] **3.2.** Refactor project Sandbox sang gRPC Server chuẩn.
- [ ] **3.3.** Khởi tạo gRPC Client Stub bên trong Worker node.
- [ ] 3.4. Cài đặt thư viện opossum làm Circuit Breaker. Bắt sự kiện open để worker.pause() (ngưng bốc job). Quan trọng: Phải cấu hình thời gian reset (vd: resetTimeout: 30000) và bắt sự kiện close (khi gRPC gọi thành công trở lại) để gọi worker.resume() cho hệ thống tự động chạy tiếp

## Phase 4: Thiết lập Môi trường Cố lập (Sandbox Hardening)

- [ ] **4.1.** Chỉnh sửa Dockerfile của Sandbox để nhúng `nsjail`.
- [ ] **4.2.** Áp dụng giới hạn `rlimit_fsize` chống tràn file output để cắt Payload lớn.
- [ ] **4.3.** Implement chốt chặn thứ 2 tại bộ chấm (Worker): giới hạn Output Text length < 2048 chars trước khi ném cho SSE hay Database.
- [ ] **4.4**. Phân tách rạch ròi 2 bước trong Sandbox:
  - Compile Step: Không dùng nsjail ngặt nghèo, cho phép xài RAM thoải mái (vd: 512MB) và timeout dài (vd: 10s) để dịch ra file binary/class.
  - Execute Step: Lúc này mới bọc nsjail và ép Memory Limit / Time Limit đúng với yêu cầu của Testcase, đồng thời chặn 100% Network..

## Phase 5: Cơ chế Self-Healing & Giám sát Hệ thống (Observability)

- [ ] **5.1.** Đảm bảo file `redis.conf` bật cấu hình `appendonly yes` / `appendfsync everysec`.
- [ ] **5.2.** Viết một Node JS Cronjob (Watchdog) script chạy 5 phút/lần tự scan các ID pending và `queueService.add(...)` trở lại.
- [ ] **5.3.** Khởi tạo UI debug `@bull-board/express` ở một route nội bộ (ví dụ `/admin/queues`).
