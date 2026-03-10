# TASK TRACKER: REFACTOR EXECUTION CODE V2.0

Tiến độ thực thi 5 Phase tái cấu trúc hệ thống:

## Phase 1: Nâng cấp Client-Server & Bảo mật Gateway

- [x] **1.1.** Cài đặt middleware API Rate Limiting (VD: 1 submit / 5 giây) ở `SubmissionController` hoặc qua Nginx.
- [x] **1.2.** Tạo endpoint SSE `GET /api/submissions/stream/:id` để Frontend subscribe. Đảm bảo đọc JWT qua Query Params `?token=...`.
- [x] **1.3.** Đảm bảo connection SSE tự đóng lại (`end()`) khi nhận status cuối (ACCEPTED/WA/TLE...).
- [x] **1.4.** Refactor luồng Pub/Sub: API Server lắng nghe và phát tín hiệu qua SSE thay vì WebSocket cho luồng Code Status.
- [x] **1.5.** Cập nhật `docker/nginx.conf` thêm lệnh `proxy_buffering off;` cho path `/stream`.

## Phase 2: Áp dụng Message Queue & Tính Lũy Đẳng (BullMQ)

- [x] **2.1.** Cài đặt `bullmq` và tạo instance queue (VD: `submission_queue`) dùng connection cấu hình `maxRetriesPerRequest: null`.
- [x] **2.2.** Khởi tạo Worker ở `apps/worker` trỏ tới Redis Queue URL. Thêm các Option: `lockDuration: 30000`, `attempts: 3` và `removeOnComplete: true`.
- [x] **2.3.** Refactor Worker Logic:
  - Bỏ thao tác cập nhật trạng thái `RUNNING` xuống Postgres. Gửi `RUNNING` event qua Pub/Sub.
  - Xử lý **Lũy Đẳng (Idempotent)** khi Insert kết quả: Chỉ cập nhật nếu DB đang ở `PENDING` hoặc `RUNNING`.
- [x] **2.4.** Lắng nghe sự kiện hệ thống (`SIGTERM`, `SIGINT`) để gọi `await worker.close()` nhắm mục tiêu graceful shutdown.
- [x] **2.5.** (Error Handling): Nếu Worker fail quá số attempt cho phép, gửi event `SYSTEM_ERROR` vào Pub/Sub cho người dùng và update log.

## Phase 3: Chuyển đổi gRPC & Bảo vệ Mạch (Circuit Breaker)

- [x] **3.1.** Viết file schema gRPC `sandbox.proto` ở packet thư mục chung.
- [x] **3.2.** Refactor project Sandbox sang gRPC Server chuẩn.
- [x] **3.3.** Khởi tạo gRPC Client Stub bên trong Worker node.
- [x] **3.4.** Cài đặt thư viện opossum làm Circuit Breaker. Bắt sự kiện open để worker.pause() (ngưng bốc job). Quan trọng: Phải cấu hình thời gian reset (vd: resetTimeout: 30000) và bắt sự kiện close (khi gRPC gọi thành công trở lại) để gọi worker.resume() cho hệ thống tự động chạy tiếp.
- [x] **3.5.** Hợp nhất hệ thống Logging: Chuyển đổi toàn bộ `console.*` và local logging sang `winston` tập trung tại `@backend/shared/utils`.

## Phase 4: Thiết lập Môi trường Cố lập (Sandbox Hardening)

- [x] **4.1.** Chỉnh sửa Dockerfile của Sandbox để nhúng `nsjail`.
- [x] **4.2.** Áp dụng giới hạn `rlimit_fsize` chống tràn file output để cắt Payload lớn.
- [x] **4.3.** Implement chốt chặn thứ 2 tại bộ chấm (Worker): giới hạn Output Text length < 2048 chars trước khi ném cho SSE hay Database.
- [x] **4.4**. Phân tách rạch ròi 2 bước trong Sandbox:
  - Compile Step: Không dùng nsjail ngặt nghèo, cho phép xài RAM thoải mái (vd: 512MB) và timeout dài (vd: 10s) để dịch ra file binary/class.
  - Execute Step: Lúc này mới bọc nsjail và ép Memory Limit / Time Limit đúng với yêu cầu của Testcase, đồng thời chặn 100% Network.
- [x] **4.5.** Cấu hình Docker Security: Loại bỏ `privileged: true`, áp dụng `cap_add` (SYS_ADMIN, etc.) và `security_opt: [apparmor:unconfined]`.

## Phase 5: Cơ chế Self-Healing & Giám sát Hệ thống (Observability)

- [ ] **5.1.** Đảm bảo file `redis.conf` bật cấu hình `appendonly yes` / `appendfsync everysec`.
- [ ] **5.2.** Viết một Node JS Cronjob (Watchdog) script chạy 5 phút/lần tự scan các ID pending và `queueService.add(...)` trở lại.
- [ ] **5.3.** Khởi tạo UI debug `@bull-board/express` ở một route nội bộ (ví dụ `/admin/queues`).
