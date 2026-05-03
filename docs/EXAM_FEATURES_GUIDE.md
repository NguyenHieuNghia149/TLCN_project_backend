# Exam Features Guide

## Mục tiêu

Tài liệu này mô tả toàn bộ feature exam sau đợt `exam access redesign`, gồm:
- domain model đang chạy ở backend
- flow của learner, admin, teacher
- khác biệt giữa flow mới và flow legacy
- cách test bằng Postman
- giải thích 2 lỗi dễ gặp:
  - update hybrid exam chỉ gửi `endDate` bị `VALIDATION_ERROR`
  - resolve invite token bị `INVITE_NOT_FOUND`

## Tổng quan kiến trúc

Feature exam hiện có 2 lớp API cùng tồn tại:

1. Flow mới theo `slug`
- public landing, self-registration, invite, OTP, entry-session, access-state
- admin exam management mới

2. Flow legacy theo `examId`
- join exam bằng password
- session sync cũ
- submit cũ

Flow mới là canonical cho exam access. Flow cũ được giữ để compatibility rollout.

## Các bảng chính

### `exam`

Là cấu hình gốc của bài thi.

Field quan trọng:
- `id`
- `title`
- `slug`
- `duration`
- `startDate`
- `endDate`
- `isVisible`
- `maxAttempts`
- `createdBy`
- `status`
- `accessMode`
- `selfRegistrationApprovalMode`
- `selfRegistrationPasswordRequired`
- `allowExternalCandidates`
- `registrationOpenAt`
- `registrationCloseAt`
- `registrationPassword`

### `exam_participants`

Một người trong một exam.

Field quan trọng:
- `examId`
- `userId`
- `normalizedEmail`
- `fullName`
- `source`
- `approvalStatus`
- `accessStatus`
- `approvedBy`
- `inviteSentAt`
- `joinedAt`
- `mergedIntoParticipantId`

### `exam_invites`

Invite 1-1 cho participant.

Field quan trọng:
- `examId`
- `participantId`
- `tokenHash`
- `invitedBy`
- `sentAt`
- `openedAt`
- `usedAt`
- `revokedAt`
- `expiresAt`

Lưu ý quan trọng:
- database chỉ lưu `tokenHash`
- raw `inviteToken` không recover lại được từ DB sau khi đã tạo

### `exam_entry_sessions`

Track bước trước khi tạo attempt thật:
- mở invite
- verify identity
- vào lobby
- bấm start

Field quan trọng:
- `examId`
- `participantId`
- `inviteId`
- `participationId`
- `verificationMethod`
- `status`
- `verifiedAt`
- `expiresAt`
- `lastSeenAt`

### `exam_participations`

Attempt làm bài thật.

Field quan trọng:
- `examId`
- `participantId`
- `userId`
- `attemptNumber`
- `startTime`
- `endTime`
- `submittedAt`
- `expiresAt`
- `currentAnswers`
- `submittedAnswersSnapshot`
- `answersLockedAt`
- `score`
- `scoreStatus`

### `exam_audit_logs`

Audit trail cho mọi action exam.

Field quan trọng:
- `examId`
- `actorType`
- `actorId`
- `action`
- `targetType`
- `targetId`
- `metadata`

## Access modes

### `open_registration`
- user có thể tự đăng ký
- không dùng invite link
- có thể yêu cầu password ở registration path

### `invite_only`
- không cho self-registration
- chỉ đi qua invite link
- không dùng registration password

### `hybrid`
- vừa có self-registration vừa có invite
- password chỉ áp cho registration path
- participant đã có row từ invite/manual add thì không được tạo row registration mới

## Approval và access status

### `approvalStatus`
- `pending`
- `approved`
- `rejected`

### `accessStatus`
- `invited`
- `eligible`
- `active`
- `revoked`
- `completed`
- `null`

Ý nghĩa:
- `null` nghĩa là participant chưa được approved
- `eligible` nghĩa là đã đủ điều kiện vào lobby/start
- `active` nghĩa là đang có attempt
- `completed` nghĩa là đã dùng xong quyền truy cập theo rule hiện tại

## Entry session state machine

```text
opened -> verified -> eligible -> started
(any state) -> expired
```

Rule:
- `opened`: invite hợp lệ đã được mở, hoặc participant approved đã vào access flow
- `verified`: login hoặc OTP thành công
- `eligible`: pass eligibility check
- `started`: user bấm `Start exam`
- `expired`: lazy-evaluate khi request tới và session đã hết hạn

Formula:
- `entrySession.expiresAt = max(exam.endDate, verifiedAt + 48h)`

## Participation rules

- `participation.expiresAt = min(startTime + duration, exam.endDate)`
- chỉ backend được tính `expiresAt`
- `currentAnswers` là snapshot autosave mutable
- `submittedAnswersSnapshot` là snapshot final immutable
- `answersLockedAt` là thời điểm chốt bài
- `scoreStatus` tách biệt `pending | scored | failed`

## Identity rules

### Internal user
- dùng account thật
- login qua `/api/auth/login`
- nếu email participant map tới real user, backend yêu cầu login thay vì OTP

### External candidate
- có thể đi từ self-registration hoặc invite
- OTP verify xong sẽ bind sang:
  - real user nếu email đã tồn tại
  - hoặc shadow user nếu chưa có account

### Shadow user
- dùng để giữ pipeline submission hiện tại vẫn dựa trên `userId`
- raw OTP không nằm trong DB
- OTP hiện được giữ trong memory của app process và gửi qua email

## Flow của learner

### Open registration, internal user
1. mở public exam landing
2. login
3. register exam
4. lấy access-state
5. vào lobby
6. start exam
7. sync answers
8. submit

### Open registration, external user
1. mở public exam landing
2. register exam
3. gửi OTP
4. verify OTP
5. lấy access-state
6. start exam
7. sync answers
8. submit

### Hybrid exam

#### Self-registration path
1. register với `examPassword` nếu exam yêu cầu
2. chờ `approve` nếu approval mode là `manual`
3. OTP hoặc login tùy identity
4. access-state
5. start
6. sync
7. submit

#### Invite path
1. mở invite link
2. resolve invite token
3. login hoặc OTP
4. access-state
5. start
6. sync
7. submit

### Invite only
1. phải có invite link
2. resolve invite
3. login hoặc OTP
4. access-state
5. start
6. sync
7. submit

## Flow của admin và teacher

### Quản lý exam
- list admin exams
- create exam
- update exam
- publish exam
- get exam detail

### Participant management
- add participant
- bulk import participants
- approve participant
- reject participant
- revoke participant
- resend invite
- bind account
- merge participants

### Invite rules
- chỉ gửi invite khi exam đã `published`
- participant phải `approved`
- participant không được `revoked`
- participant theo self-registration path không dùng invite link

## Flow legacy

Flow cũ vẫn còn:
- `POST /api/exams/:id/join`
- `GET /api/exams/:examId/session`
- `PUT /api/exams/session/sync`
- `POST /api/exams/:id/submit`

Flow này dựa trên:
- `examId`
- password plain exam cũ
- participation/session cũ

Nó tồn tại để compatibility, không phải flow nên mở rộng thêm.

## Postman collection

Các file:
- [exam-flows.postman_collection.json](/D:/Workspace/TLCN/project/backend/postman/exam-flows.postman_collection.json)
- [exam-flows.local.postman_environment.json](/D:/Workspace/TLCN/project/backend/postman/exam-flows.local.postman_environment.json)

Folder:
- `00 Auth & Bootstrap`
- `01 Admin - Redesign`
- `02 Public & Learner - Redesign`
- `03 Legacy Compatibility`
- `04 Negative & Edge Cases`

Collection tự set nhiều biến runtime:
- `teacherAccessToken`
- `studentAccessToken`
- `openExamId`, `openExamSlug`
- `hybridExamId`, `hybridExamSlug`
- `inviteExamId`, `inviteExamSlug`
- `participantId`
- `entrySessionId`
- `participationId`

### Biến phải nhập tay

Credential:
- `teacherEmail`
- `teacherPassword`
- `studentEmail`
- `studentPassword`

Secret cần lấy từ email:
- `inviteToken`
- `openExternalOtpCode`
- `manualOtpCode`
- `inviteOtpCode`

## Giải thích 2 lỗi thường gặp

### 1. `Update Hybrid Exam Schedule` báo:
`Self-registration exams must declare an approval mode`

Nguyên nhân:
- backend `updateAdminExam()` validate lại toàn bộ cấu hình effective của exam, không chỉ field patch
- nếu exam hiện tại đang ở `accessMode = hybrid` hoặc `open_registration` mà effective config không có `selfRegistrationApprovalMode`, update chỉ gửi `endDate` sẽ fail

Điều này xảy ra khi:
- exam row cũ được tạo từ state trước khi rule mới ổn định
- hoặc test Postman dùng một `hybridExamId` cũ / stale

Cách xử lý:
1. chạy lại từ đầu folder `01 Admin - Redesign` để lấy exam mới
2. dùng request update đã sửa trong collection, body hiện gửi lại:
   - `accessMode`
   - `selfRegistrationApprovalMode`
   - `selfRegistrationPasswordRequired`
   - `allowExternalCandidates`
   - `endDate`

Kết luận:
- lỗi này không phải do route 404
- đây là `400 VALIDATION_ERROR` từ business rule

### 2. `Resolve Invite Token` báo:
`INVITE_NOT_FOUND`

Nguyên nhân phổ biến nhất:
- biến `inviteToken` đang rỗng hoặc vẫn là placeholder
- hoặc token không phải raw token thật

`inviteToken` lấy từ đâu:
- từ email invite được gửi cho participant
- hoặc từ SMTP catcher local như MailHog/Mailpit/Maildev nếu môi trường dev cấu hình qua đó

`inviteToken` không lấy từ DB được vì:
- DB chỉ lưu `exam_invites.tokenHash`
- raw token được generate một lần khi gửi invite và nhúng vào link email
- sau đó backend chỉ còn hash để verify

Ví dụ link email:
- `http://localhost:3000/exam/<slug>/entry?invite=<raw_invite_token>`

Phần cần copy chính là `<raw_invite_token>`.

Kết luận:
- nếu chỉ có `inviteId` trong response admin resend invite thì chưa đủ để resolve
- phải lấy raw token từ email outbound

## OTP: nguồn lấy mã đúng

OTP hiện không có table DB riêng.

Backend hiện tại:
- generate OTP trong `email.service.ts`
- lưu OTP trong memory map của process
- gửi OTP qua email
- verify xong thì xóa khỏi memory

Nghĩa là:
- không query DB để lấy OTP được
- muốn test thủ công phải đọc email thật hoặc dùng SMTP catcher local

## Khuyến nghị local testing

Nếu muốn test trọn flow invite + OTP bằng Postman, nên chạy local email catcher như:
- MailHog
- Mailpit
- Maildev

Như vậy có thể:
- copy raw invite link/token
- copy OTP code

Nếu không có email catcher hoặc inbox test:
- vẫn test được phần lớn admin/public flow
- nhưng invite resolve và OTP verify sẽ bị block ở bước secret

## Checklist test nhanh

### Smoke cho flow mới
1. `00 Auth & Bootstrap`
2. `01 Admin - Redesign`
3. `02 Public & Learner - Redesign`
4. `04 Negative & Edge Cases`

### Smoke cho flow legacy
1. `00 Auth & Bootstrap`
2. `03 Legacy Compatibility`

## Trạng thái hiện tại

Sau khi kiểm tra:
- collection Postman đã được chỉnh lại mô tả secret source cho đúng
- request `Update Hybrid Exam Schedule` đã được sửa body để gửi lại các field policy ổn định
- docs này phản ánh đúng behavior hiện tại của backend, không giả định raw invite token hoặc OTP có thể lấy từ DB
