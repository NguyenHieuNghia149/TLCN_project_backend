ALTER TABLE "exam_proctoring_data_requests"
  ADD COLUMN IF NOT EXISTS "requester_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp,
  ADD COLUMN IF NOT EXISTS "reason_code" varchar(80),
  ADD COLUMN IF NOT EXISTS "execution_target_hours" integer DEFAULT 72 NOT NULL,
  ADD COLUMN IF NOT EXISTS "legal_hold_until" timestamp,
  ADD COLUMN IF NOT EXISTS "request_metadata_json" jsonb,
  ADD COLUMN IF NOT EXISTS "evidence_report_json" jsonb,
  ADD COLUMN IF NOT EXISTS "last_execution_dry_run" boolean,
  ADD COLUMN IF NOT EXISTS "last_execution_requested_at" timestamp,
  ADD COLUMN IF NOT EXISTS "last_execution_requested_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "dry_run_mode" varchar(20);

ALTER TABLE "exam_proctoring_data_requests"
  DROP CONSTRAINT IF EXISTS "ck_exam_proctoring_data_requests_type";

ALTER TABLE "exam_proctoring_data_requests"
  ADD CONSTRAINT "ck_exam_proctoring_data_requests_type"
  CHECK ("request_type" IN ('withdraw_consent', 'delete', 'restrict', 'anonymize', 'export', 'access', 'retention_review'));

ALTER TABLE "exam_proctoring_data_requests"
  DROP CONSTRAINT IF EXISTS "ck_exam_proctoring_data_requests_status";

ALTER TABLE "exam_proctoring_data_requests"
  ADD CONSTRAINT "ck_exam_proctoring_data_requests_status"
  CHECK ("status" IN ('requested', 'approved', 'validated', 'rejected', 'in_progress', 'completed', 'blocked_by_retention', 'blocked_legal_hold', 'failed'));

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_data_requests_status_due"
  ON "exam_proctoring_data_requests" ("status", "internal_target_due_at");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_data_requests_type_status"
  ON "exam_proctoring_data_requests" ("request_type", "status");
