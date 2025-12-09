**Tổng Quan**

- **Mục tiêu**: Mô tả chi tiết tính năng thi (exam) trong hệ thống: luồng tạo bài thi, tham gia thi, lưu trạng thái phiên thi server-side, resume/sync, quy tắc thời gian, cấu trúc DB liên quan, API, và luồng backend (controller → service → repository).
- **Giải thích ngắn**: Tránh lưu trạng thái thi quan trọng ở client (localStorage). Server là nguồn dữ liệu chính cho trạng thái phiên (expiresAt, currentAnswers, isSubmitted, startedAt, lastSyncedAt). Frontend chỉ hiển thị đồng hồ và gửi đồng bộ định kỳ.

**Kiến Trúc & Phân Lớp**

- **Controller**: Chỉ parse, validate request (HTTP). Trả về response rõ ràng. Không chứa logic nghiệp vụ hay truy vấn DB.
- **Service**: Chứa logic nghiệp vụ, kiểm tra business rules, xử lý luồng (ví dụ: validate thời gian, quyết định gọi repository nào). KHÔNG thực hiện truy vấn DB trực tiếp.
- **Repository**: Toàn bộ truy vấn DB, quản lý giao dịch (transaction). Repository cho phép nhận `tx` tùy chọn để compose giao dịch từ trên xuống.

**DB / Schema (tóm tắt)**

- **Bảng chính liên quan**:
  - `exams`: metadata bài thi (title, duration, creator, ...).
  - `exam_participations`: lưu phiên tham gia; các trường mới/đã di chuyển vào đây:
    - **`session_id`**: UUID/identifier cho phiên (server-issued), dùng để resume.
    - **`expires_at`**: thời hạn phiên do server xác định.
    - **`current_answers`**: kiểu `jsonb` — lưu đáp án hiện tại theo dạng object {problemId: {choice, answer, updatedAt}}.
    - **`is_submitted`**, **`started_at`**, **`last_synced_at`**, **`client_progress`** (tùy dự án).
  - `problems`, `testcases`, `solutions`, `exam_to_problems` (quan hệ exam ↔ problem).

- **Ghi chú migration**:
  - Chuyển trường session từ client/localStorage vào `exam_participations`.
  - Convert `current_answers` sang `jsonb`: trước khi chạy migration, đảm bảo mọi record có dạng JSON hợp lệ hoặc viết script chuyển đổi.

**Luồng nghiệp vụ (Overview)**

1. Tạo exam (Admin/Creator)
   - Endpoint: `POST /api/admin/exams` (controller validate payload)
   - Service orchestration: chuẩn hóa input, gọi `ExamRepository.createExamWithChallenges`.
   - Repository: thực hiện transaction gồm insert `exams`, tạo/validate problems (sử dụng `ProblemRepository.createProblemTransactional` với `tx` truyền vào), link `exam_to_problems`.
   - Kết quả: nếu bất kỳ bước nào fail, toàn bộ transaction rollback.

2. Bắt đầu một phiên tham gia (user bắt đầu thi)
   - Endpoint: `POST /api/exams/:examId/participations` → server tạo bản ghi `exam_participations` với `session_id` mới và `expires_at = now + duration`.
   - Response: trả `session_id` (secure cookie hoặc trả trong body; KHÔNG yêu cầu client lưu vào localStorage để quyết định đúng/không tuỳ thiết kế — server phải cho phép resume qua `session_id` gửi kèm mỗi request).

3. Đồng bộ trạng thái (Client autosave / sync)
   - Endpoint: `PUT /api/exams/participations/:sessionId/sync`
   - Payload: partial hoặc đầy đủ `current_answers` (JSON), `lastClientTime`, optional progress data.
   - Service: kiểm tra xem `session` tồn tại và chưa expired; nếu expired → trả lỗi (401/410) hoặc cho phép resume có hạn.
   - Repository: cập nhật `exam_participations.current_answers`, `last_synced_at` trong transaction ngắn.

4. Resume / Resume from different device
   - Endpoint: `GET /api/exams/participations/:sessionId` hoặc `POST /api/exams/participations/resume` (có thể có auth)
   - Server trả trạng thái hiện tại: `expiresAt`, `currentAnswers`, `startedAt`, `isSubmitted`.
   - Frontend: khôi phục UI từ payload server.

5. Submit exam
   - Endpoint: `POST /api/exams/participations/:sessionId/submit`
   - Service: kiểm tra `expiresAt` trên server, validate time window, mark `is_submitted = true` và tiến hành chấm điểm (sync -> submission -> grading service/repository).
   - Nếu submit sau `expiresAt` → server quyết định theo policy (reject hoặc accept with late penalty).

**API Chi Tiết (ví dụ)**

- `POST /api/exams/:examId/participations`
  - Request body: `{ userId?: string }` (tùy auth)
  - Response: `{ sessionId: string, expiresAt: string, startedAt: string }

- `PUT /api/exams/participations/:sessionId/sync`
  - Request body: `{ currentAnswers: object, clientTimestamp?: string }
  - Response: `{ ok: true, expiresAt: string, serverTime: string }

- `GET /api/exams/participations/:sessionId`
  - Response: `{ sessionId, expiresAt, currentAnswers, isSubmitted, startedAt }

- `POST /api/exams/participations/:sessionId/submit`
  - Response: `{ success: boolean, score?: number, gradedAt?: string }

**Tương tác Frontend (best practices)**

- **Không dùng localStorage để làm nguồn thật**: Client có thể lưu `sessionId` tạm thời để UX (nhưng server mới là authority). Nếu client loses localStorage, người dùng có thể resume nếu họ có `sessionId` (ví dụ qua backend user profile hoặc gửi userId để tìm participation gần nhất).
- **Autosave cadence**: gửi sync đều đặn (ví dụ 5–15s) hoặc khi có thay đổi trọng yếu; backend cần idempotency and partial updates support.
- **Timer UI**: Hiển thị countdown dựa trên server `expiresAt` (được trả khi bắt đầu hoặc trong mỗi response sync). Client chỉ hiển thị; server tính toán cutoff.
- **Offline**: nếu offline, queue local changes and attempt sync when back online. Server-side last-write-wins hoặc merge strategy cần được xác định.

**Thiết kế backend: transaction & rollback**

- **Nguyên tắc**: mọi thao tác liên quan đến tạo exam + tạo problems + liên kết → thực hiện trong một transaction duy nhất tại `ExamRepository` để đảm bảo atomicity.
- **API repository**: `createProblemTransactional(input, tx?)` — nếu caller cung cấp `tx`, repository sử dụng tx đó; nếu không, nó tự mở tx của riêng nó. Điều này cho phép compose transaction từ `ExamRepository`.
- **Lỗi & rollback**: nếu tạo problem fail (ví dụ: testcase insert lỗi), exam creation toàn bộ rollback.

**Các file chính (ví dụ thực tế trong codebase)**

- **Controllers**:
  - `src/controllers/exam.controller.ts`
  - `src/controllers/participation.controller.ts`
- **Services**:
  - `src/services/exam.service.ts` — orchestration, validate business rules
  - `src/services/exam-auto-submit.service.ts` — auto-submit khi hết hạn (gọi service chính để finalize)
- **Repositories**:
  - `src/repositories/exam.repository.ts` — `createExamWithChallenges`, `getExamDetails`
  - `src/repositories/problem.repository.ts` — `_executeCreateProblem`, `createProblemTransactional`
  - `src/repositories/examParticipation.repository.ts` — CRUD cho `exam_participations`

**Kiểm tra & Tests đề xuất**

- **Unit tests**:
  - `ExamService` logic (business rules): enforce time windows, resume rules, submission policy.
  - `ProblemRepository._executeCreateProblem` — đảm bảo testcases/solutions/approaches inserted.
- **Integration tests**:
  - Tạo exam với nhiều problems: gây lỗi trong một problem (ví dụ insert testcase lỗi) và assert rằng không có record exam được tạo (transaction rollback).
  - Participation lifecycle: start → sync multiple times → submit before expiry → assert grading và is_submitted = true.
  - Expiry handling: attempt submit after `expiresAt` → server rejects hoặc xử lý theo policy.

**Mật mã an toàn & session handling**

- `session_id` nên là token khó đoán (UUIDv4/ULID) hoặc JWT ngắn hạn nếu chứa dữ liệu.
- Không lưu nội dung nhạy cảm client-side.
- Nếu cần resume từ account, liên kết `exam_participations` với `user_id` để có thể phục hồi session từ server (ví dụ: "find latest unsubmitted participation for userId+examId").

**Migrations & Deployment**

- Chạy migration `current_answers` → `jsonb` trên staging trước production.
- Viết script dọn dẹp non-JSON or legacy payloads.
- Phased rollout:
  1. Deploy backend DB + API reading cả legacy và json fields (backwards-compat)
  2. Migrate data
  3. Switch frontend to server-authoritative flow

**Logging, Monitoring & Observability**

- Log events: `participation.created`, `participation.synced`, `participation.submitted`, `auto-submitted`.
- Metrics: number of active participations, sync frequency, failed syncs, late submissions.
- Alerts: spikes in failed syncs, high rollback rate during exam creation.

**Edge Cases & Quyết định chính sách**

- **Client loses `sessionId`**: nếu user logged-in, server có thể tìm participation mở theo `userId`+`examId`. Nếu anonymous, có thể không thể resume.
- **Clock skew**: luôn dùng server time as authority; client timestamps chỉ để heuristic / debugging.
- **Partial updates merging**: định nghĩa merge strategy cho `current_answers` (lastWriterWins theo `updatedAt`).

**Next Steps đề xuất**

- Thêm integration tests cho rollback transaction (priority cao).
- Thực hiện một pass để chuyển mọi service-level `db` usage vào repository (đã bắt đầu một số refactor).
- Thêm `eslint.config.js` shim để unblock lint trong CI.
- Viết hướng dẫn vận hành migration và runbook khi cần rollback migration.

**Tài liệu tham chiếu trong codebase**

- `backend/src/repositories/problem.repository.ts` — chứa `_executeCreateProblem` và public transactional API.
- `backend/src/repositories/exam.repository.ts` — chứa `createExamWithChallenges` (transaction composition).
- `backend/src/repositories/examParticipation.repository.ts` — lưu/restore participation data.

---

Nếu bạn muốn, tôi có thể:

- Bổ sung phần "Ví dụ request/response cURL" chi tiết cho từng endpoint.
- Thêm sơ đồ sequence (ASCII hoặc Mermaid) minh họa luồng create → create problems → sync → submit.
- Tạo bài test tích hợp mẫu để kiểm chứng rollback transaction.
