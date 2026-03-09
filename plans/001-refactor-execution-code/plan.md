# KẾ HOẠCH CẢI TIẾN KIẾN TRÚC JUDGE SYSTEM V2.0 (ENTERPRISE GRADE)

## 1. Tầm Nhìn Kiến Trúc (Architectural Vision)

Hệ thống V1.0 (sử dụng WebSocket/Polling và Redis List thuần) đáp ứng được mặt tính năng (Functional) nhưng thiếu hụt khả năng mở rộng (Scalability) và tính toàn vẹn dữ liệu (Data Integrity).

Kiến trúc V2.0 được thiết kế để giải quyết 3 bài toán cốt lõi của một nền tảng Online Coding thực tế:

1.  **Zero Data Loss:** Không thất thoát bài nộp (submission) ngay cả khi hệ thống sụp đổ cục bộ (Worker crash, OOM).
2.  **I/O Bottleneck Elimination:** Loại bỏ hoàn toàn áp lực Read/Write thừa thãi lên Database (PostgreSQL).
3.  **Strict Security & Isolation:** Cách ly mã nguồn độc hại ở cấp độ Kernel hệ điều hành (Namespaces, Cgroups, Seccomp) thay vì chỉ gói gọn trong Docker thông thường.

---

## 2. Thiết Kế Hệ Thống Chi Tiết (Detailed System Design)

### 2.1. Tầng Giao Tiếp Trực Tiếp (API Gateway & Client)

- **Giao thức:** Chuyển đổi từ Polling/WebSocket sang **Server-Sent Events (SSE)**.
- **Bảo vệ API (Rate Limiting):** Thiết lập giới hạn request tại Nginx hoặc API Server (VD: 1 bài nộp / 5 giây / user) để chống bão DDoS Layer 7 làm cạn kiệt RAM Redis.
- **Cơ chế hoạt động:**
  - Client gửi `POST /api/v1/submissions`.
  - API trả về `HTTP 201 Created` kèm `submissionId`.
  - Client lập tức mở kết nối 1 chiều `GET /api/v1/submissions/stream/:submissionId`.
  - Server giữ kết nối HTTP Keep-Alive, đẩy dữ liệu (flush stream) ngay khi có thông báo từ Redis Pub/Sub, không cần truy vấn Database.
- **Ưu điểm:** Tận dụng Multiplexing của HTTP/2, không giới hạn kết nối, dễ dàng cấu hình qua Nginx (với `proxy_buffering off;`).

### 2.2. Tầng Quản Lý Hàng Đợi (Message Queue - BullMQ)

- **Công nghệ:** **BullMQ** chạy trên nền Redis.
- **Cơ chế hoạt động:**
  - Thay thế lệnh `LPUSH/RPOP` ngây thơ bằng cơ chế **Lock & State Management**.
  - **Stalled Jobs:** Tự động phát hiện Worker bị sập ngang (thông qua Heartbeat/Lock expiration) và đưa Job trở lại hàng đợi `Waiting`.
  - **Dead Letter Queue (DLQ):** Giới hạn số lần thử lại (Attempts). Tránh hiệu ứng "Poison Pill" (một bài code độc làm sập toàn bộ cluster Worker).

### 2.3. Tầng Xử Lý Trung Tâm (Worker Node)

- **Tối ưu State:** Chỉ ghi Database đúng 2 lần (lúc khởi tạo `PENDING` và lúc kết thúc `ACCEPTED`/`WA`/`TLE`). Trạng thái `RUNNING` chỉ lưu trên Redis Cache.
- **Idempotency (Tính Lũy Đẳng):** Áp dụng điều kiện strict khi Update DB (`WHERE id = ? AND status IN ('PENDING', 'RUNNING')`). Ngăn chặn tuyệt đối việc ghi đè kết quả hoặc cộng dồn điểm Ranking nếu BullMQ vô tình retry job do nhiễu mạng.
- **Circuit Breaker:** Bọc luồng gọi gRPC sang Sandbox bằng Circuit Breaker. Nếu cụm Sandbox sập (lỗi gRPC 5 lần liên tiếp), Worker tự động ngắt mạch (Open) và _tạm ngưng bốc Job (Pause Queue)_, bảo vệ các bài thi chưa chấm khỏi việc bị đẩy oan vào DLQ.
- **Giao tiếp Sandbox:** Gọi sang Sandbox thông qua giao thức **gRPC** (Protobuf), nén nhị phân siêu tốc.

### 2.4. Tầng Thực Thi Mã Nguồn (Isolated Sandbox)

- **Bản chất:** Một gRPC Server nằm trong Docker Container bị tước bỏ mọi quyền hạn (`--cap-drop=ALL`).
- **Lớp phòng thủ Hệ điều hành:**
  1.  **Namespaces:** Ẩn toàn bộ hệ thống file host, cắt đứt 100% Internet.
  2.  **Cgroups v2:** Giới hạn cứng RAM và CPU.
  3.  **Seccomp BPF:** Chặn đứng các System Call nguy hiểm (`fork()`, `execve()`).
- **Output Truncation (Cắt tỉa Payload):** Ngăn chặn mã độc in log vô tận phá sập hệ thống qua 3 chốt chặn: Set `rlimit_fsize` tại Kernel -> Cắt chuỗi tại Worker (Max 2048 chars) -> Giới hạn schema `VARCHAR` tại Database.

### 2.5. Cơ chế Chống lỗi & Toàn vẹn dữ liệu (Failover & Data Integrity)

- **Tầng 1 (Hạ tầng): Bật Redis Persistence (AOF)**
  - Cấu hình file `redis.conf`: bật `appendonly yes` và `appendfsync everysec` để tránh mất RAM in-memory.
- **Tầng 2 (Ứng dụng): Cơ chế Đối soát (Reconciliation / Watchdog)**
  - Worker Cronjob chạy độc lập mỗi 5 phút, quét bảng `submissions` trong PostgreSQL. Tự động đẩy (Re-queue) các bài kẹt ở trạng thái `PENDING`/`RUNNING` quá thời gian quy định trở lại BullMQ.

---

## 3. Lộ Trình Triển Khai (Implementation Roadmap)

### Phase 1: Nâng cấp Client-Server & Bảo mật Gateway

- [ ] Thiết lập API Rate Limiting.
- [ ] Implement endpoint GET /api/v1/submissions/stream/:id với tiêu chuẩn SSE. Lưu ý cho AI: Vì EventSource không hỗ trợ Header, xử lý Auth JWT bằng cách truyền qua Query Parameter ?token=... hoặc sử dụng thư viện @microsoft/fetch-event-source ở Frontend để truyền Head.
- [ ] Tích hợp Redis Pub/Sub giữa API Server và Worker.
- [ ] Cấu hình Nginx vô hiệu hóa buffering cho endpoint SSE.

### Phase 2: Áp dụng Message Queue & Tính Lũy Đẳng

- [ ] Tích hợp `bullmq` Queue và cấu hình Worker (`attempts`, `lockDuration`, `stalledInterval`).
- [ ] Triển khai logic tính Lũy Đẳng (Idempotency) vào các câu query Update Database.
- [ ] Bổ sung tín hiệu `SIGTERM`, `SIGINT` cho Worker Node để đảm bảo Graceful Shutdown.

### Phase 3: Chuyển đổi gRPC & Bảo vệ Mạch (Circuit Breaker)

- [ ] Thiết kế file hợp đồng `sandbox.proto` ở package dùng chung.
- [ ] Refactor Sandbox API sang gRPC Server và viết gRPC Client Stub cho Worker.
- [ ] Cài đặt Circuit Breaker (`opossum`) tại Worker để Pause Queue khi gRPC thất bại liên tục.

### Phase 4: Thiết lập Môi trường Cố lập (Sandbox Hardening)

- [ ] Tích hợp `Nsjail` vào Dockerfile. Áp dụng giới hạn `rlimit_fsize` để cắt payload tại OS.
- [ ] Cấu hình Worker slice chuỗi output (< 2048 chars) trước khi lưu DB và bắn SSE.
- [ ] Triển khai Sandbox Container với quyền hạn tối thiểu.

### Phase 5: Cơ chế Self-Healing & Giám sát Hệ thống (Observability)

- [ ] Cấu hình `appendonly yes` cho Redis.
- [ ] Viết Watchdog Cronjob (mỗi 5 phút) quét PostgreSQL để Re-Queue các job bị kẹt.
- [ ] Cài đặt `@bull-board/express` theo dõi UI BullMQ.
- [ ] Tích hợp Prometheus/Grafana đo lường tài nguyên Sandbox và thiết lập Alerting.

---

## 4. Đặc Tả Giao Thức (Protocol Specifications)

**A. Chuẩn thông báo SSE (Data Payload):**

```json
{
  "submissionId": "uuid-v4",
  "status": "ACCEPTED",
  "score": 100,
  "executionTimeMs": 145,
  "memoryUsedKb": 12400,
  "testcaseResults": [
    {
      "id": "tc-1",
      "status": "ACCEPTED",
      "actualOutput": "Hello World",
      "timeTakenMs": 12
    }
  ]
}
```

**B. Hợp đồng gRPC (`sandbox.proto`):**

````protobuf
**B. Hợp đồng gRPC (`sandbox.proto`):**

```protobuf
syntax = "proto3";
package judge;

service SandboxService {
  rpc ExecuteCode (ExecutionRequest) returns (ExecutionResponse);
}

message ExecutionRequest {
  string source_code = 1;
  string language = 2;
  int32 time_limit_ms = 3;
  int32 memory_limit_kb = 4;
  repeated TestCase test_cases = 5; // BẮT BUỘC PHẢI CÓ
}

message TestCase {
  string id = 1;
  string input = 2;
  string expected_output = 3;
}

message ExecutionResponse {
  string submission_id = 1;
  string overall_status = 2; // ACCEPTED, WRONG_ANSWER, TIME_LIMIT_EXCEEDED, RUNTIME_ERROR, COMPILATION_ERROR
  string compile_error = 3;  // Chứa log lỗi nếu compile C++/Java thất bại
  repeated TestCaseResult results = 4;
}

message TestCaseResult {
  string test_case_id = 1;
  string status = 2;
  int32 time_taken_ms = 3;
  int32 memory_used_kb = 4;
  string actual_output = 5;
  string error_message = 6;
}
````
