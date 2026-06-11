CREATE TABLE IF NOT EXISTS "exam_proctoring_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "enabled" boolean DEFAULT false NOT NULL,
  "require_camera" boolean DEFAULT true NOT NULL,
  "require_screen_share" boolean DEFAULT true NOT NULL,
  "require_fullscreen" boolean DEFAULT true NOT NULL,
  "require_monitor_display_surface" boolean DEFAULT true NOT NULL,
  "precheck_validity_seconds" integer DEFAULT 300 NOT NULL,
  "heartbeat_interval_seconds" integer DEFAULT 10 NOT NULL,
  "missed_heartbeat_grace_multiplier" integer DEFAULT 3 NOT NULL,
  "screen_share_resume_timeout_seconds" integer DEFAULT 30 NOT NULL,
  "fullscreen_resume_timeout_seconds" integer DEFAULT 15 NOT NULL,
  "allowed_event_types_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "risk_weights_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "risk_thresholds_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "clipboard_policy" varchar(30) DEFAULT 'log_only' NOT NULL,
  "ai_anomaly_enabled" boolean DEFAULT true NOT NULL,
  "ai_shadow_mode" boolean DEFAULT true NOT NULL,
  "ai_job_window_seconds" integer DEFAULT 300 NOT NULL,
  "consent_notice_version" varchar(50) NOT NULL,
  "legal_links_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "data_retention_days" integer DEFAULT 180 NOT NULL,
  "data_deletion_sla_days" integer DEFAULT 20 NOT NULL,
  "sensitive_data_deletion_target_hours" integer DEFAULT 72 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_exam_proctoring_settings_exam" UNIQUE ("exam_id")
);

CREATE TABLE IF NOT EXISTS "exam_proctoring_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "entry_session_id" uuid REFERENCES "exam_entry_sessions"("id"),
  "participation_id" uuid REFERENCES "exam_participations"("id"),
  "candidate_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "client_session_id" varchar(100) NOT NULL,
  "status" varchar(30) NOT NULL,
  "notice_version" varchar(50) NOT NULL,
  "notice_snapshot_json" jsonb NOT NULL,
  "accepted_capabilities_json" jsonb NOT NULL,
  "legal_links_snapshot_json" jsonb NOT NULL,
  "data_retention_days_snapshot" integer NOT NULL,
  "data_deletion_sla_days_snapshot" integer NOT NULL,
  "sensitive_data_deletion_target_hours_snapshot" integer NOT NULL,
  "accepted_at" timestamp NOT NULL,
  "withdrawn_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_exam_proctoring_consents_status" CHECK ("status" IN ('accepted', 'withdrawn', 'superseded'))
);

CREATE TABLE IF NOT EXISTS "exam_proctoring_prechecks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "entry_session_id" uuid REFERENCES "exam_entry_sessions"("id"),
  "participation_id" uuid REFERENCES "exam_participations"("id"),
  "candidate_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "client_session_id" varchar(100) NOT NULL,
  "consent_record_id" uuid NOT NULL REFERENCES "exam_proctoring_consents"("id"),
  "browser_name" varchar(80),
  "browser_version" varchar(80),
  "os_name" varchar(80),
  "get_user_media_supported" boolean NOT NULL,
  "camera_permission_granted" boolean NOT NULL,
  "get_display_media_supported" boolean NOT NULL,
  "display_surface" varchar(30),
  "monitor_validated" boolean NOT NULL,
  "fullscreen_supported" boolean NOT NULL,
  "browser_supported" boolean NOT NULL,
  "passed" boolean NOT NULL,
  "failure_reasons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "exam_proctoring_bypass_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "entry_session_id" uuid REFERENCES "exam_entry_sessions"("id"),
  "participation_id" uuid REFERENCES "exam_participations"("id"),
  "client_session_id" varchar(100) NOT NULL,
  "code_hash" varchar(255) NOT NULL,
  "status" varchar(30) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "issued_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "used_by_user_id" uuid REFERENCES "users"("id"),
  "used_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_exam_proctoring_bypass_status" CHECK ("status" IN ('issued', 'used', 'revoked', 'expired'))
);

CREATE TABLE IF NOT EXISTS "exam_proctoring_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "entry_session_id" uuid REFERENCES "exam_entry_sessions"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "candidate_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "client_session_id" varchar(100) NOT NULL,
  "consent_record_id" uuid NOT NULL REFERENCES "exam_proctoring_consents"("id"),
  "precheck_id" uuid REFERENCES "exam_proctoring_prechecks"("id"),
  "bypass_code_id" uuid REFERENCES "exam_proctoring_bypass_codes"("id"),
  "status" varchar(30) NOT NULL,
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp,
  "last_seen_at" timestamp,
  "last_accepted_client_seq" integer DEFAULT 0 NOT NULL,
  "last_persisted_client_seq" integer DEFAULT 0 NOT NULL,
  "active_deadline_type" varchar(50),
  "active_deadline_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_exam_proctoring_sessions_status" CHECK ("status" IN ('healthy', 'grace_open', 'escalated', 'suspended', 'completed', 'timed_out', 'archived')),
  CONSTRAINT "uq_exam_proctoring_sessions_participation_client" UNIQUE ("participation_id", "client_session_id")
);

-- PostgreSQL requires every unique or primary constraint on a partitioned
-- table to include the partition key. The logical event identifier remains
-- "id", while the physical primary key includes participation_id.
CREATE TABLE IF NOT EXISTS "exam_proctoring_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL,
  "participation_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "entry_session_id" uuid,
  "candidate_user_id" uuid NOT NULL,
  "client_session_id" varchar(100) NOT NULL,
  "client_seq" integer NOT NULL,
  "type" varchar(80) NOT NULL,
  "severity" varchar(20) NOT NULL,
  "schema_version" integer NOT NULL,
  "payload_json" jsonb NOT NULL,
  "captured_at" timestamp NOT NULL,
  "received_at" timestamp NOT NULL,
  "persisted_at" timestamp DEFAULT now() NOT NULL,
  "buffered" boolean DEFAULT false NOT NULL,
  "final_flush_receipt_id" uuid,
  CONSTRAINT "pk_exam_proctoring_events" PRIMARY KEY ("participation_id", "id"),
  CONSTRAINT "uq_exam_proctoring_events_dedupe" UNIQUE ("participation_id", "client_session_id", "client_seq")
) PARTITION BY HASH ("participation_id");

CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p0" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p1" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 1);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p2" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 2);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p3" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 3);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p4" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 4);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p5" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 5);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p6" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 6);
CREATE TABLE IF NOT EXISTS "exam_proctoring_events_p7" PARTITION OF "exam_proctoring_events" FOR VALUES WITH (MODULUS 8, REMAINDER 7);

CREATE TABLE IF NOT EXISTS "exam_proctoring_final_flush_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "session_id" uuid NOT NULL REFERENCES "exam_proctoring_sessions"("id"),
  "client_session_id" varchar(100) NOT NULL,
  "submit_attempt_id" varchar(100) NOT NULL,
  "status" varchar(30) NOT NULL,
  "expected_event_count" integer DEFAULT 0 NOT NULL,
  "accepted_count" integer DEFAULT 0 NOT NULL,
  "deduped_count" integer DEFAULT 0 NOT NULL,
  "persisted_count" integer DEFAULT 0 NOT NULL,
  "first_client_seq" integer,
  "last_client_seq" integer,
  "error_code" varchar(80),
  "error_message" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "persisted_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_exam_proctoring_final_flush_status" CHECK ("status" IN ('received', 'persisting', 'persisted', 'failed', 'timeout')),
  CONSTRAINT "uq_exam_proctoring_final_flush_participation_submit" UNIQUE ("participation_id", "submit_attempt_id")
);

CREATE TABLE IF NOT EXISTS "exam_proctoring_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "session_id" uuid REFERENCES "exam_proctoring_sessions"("id"),
  "risk_score" integer DEFAULT 0 NOT NULL,
  "risk_level" varchar(20) DEFAULT 'low' NOT NULL,
  "event_counts_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "velocity_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "final_flush_status" varchar(30),
  "last_event_captured_at" timestamp,
  "last_event_received_at" timestamp,
  "deterministic_schema_version" varchar(50) NOT NULL,
  "computed_at" timestamp NOT NULL,
  "reviewer_decision" varchar(30) DEFAULT 'pending' NOT NULL,
  "reviewer_id" uuid REFERENCES "users"("id"),
  "reviewer_notes" varchar(2000),
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_exam_proctoring_summaries_participation" UNIQUE ("participation_id")
);

CREATE TABLE IF NOT EXISTS "proctoring_ai_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_key" varchar(200) NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "session_id" uuid REFERENCES "exam_proctoring_sessions"("id"),
  "window_start" timestamp NOT NULL,
  "window_end" timestamp NOT NULL,
  "status" varchar(30) NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "payload_json" jsonb NOT NULL,
  "payload_schema_version" varchar(50) NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "next_run_at" timestamp DEFAULT now() NOT NULL,
  "locked_by" varchar(100),
  "locked_at" timestamp,
  "last_error" varchar(1000),
  "result_json" jsonb,
  "result_model_version" varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  CONSTRAINT "uq_proctoring_ai_jobs_job_key" UNIQUE ("job_key"),
  CONSTRAINT "ck_proctoring_ai_jobs_status" CHECK ("status" IN ('pending', 'running', 'completed', 'retry', 'dead_letter', 'skipped'))
);

CREATE TABLE IF NOT EXISTS "exam_proctoring_data_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid REFERENCES "exam_participations"("id"),
  "candidate_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "request_type" varchar(30) NOT NULL,
  "status" varchar(30) NOT NULL,
  "requested_at" timestamp NOT NULL,
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "statutory_due_at" timestamp NOT NULL,
  "internal_target_due_at" timestamp NOT NULL,
  "completed_at" timestamp,
  "result_json" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ck_exam_proctoring_data_requests_type" CHECK ("request_type" IN ('withdraw_consent', 'delete', 'restrict', 'anonymize')),
  CONSTRAINT "ck_exam_proctoring_data_requests_status" CHECK ("status" IN ('requested', 'approved', 'processing', 'completed', 'blocked_by_retention', 'failed'))
);

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_consents_candidate_exam" ON "exam_proctoring_consents" ("candidate_user_id", "exam_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_consents_participation" ON "exam_proctoring_consents" ("participation_id");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_prechecks_candidate_exam" ON "exam_proctoring_prechecks" ("candidate_user_id", "exam_id", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_prechecks_participation" ON "exam_proctoring_prechecks" ("participation_id");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_bypass_lookup" ON "exam_proctoring_bypass_codes" ("exam_id", "entry_session_id", "participation_id", "client_session_id");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_bypass_status_expires" ON "exam_proctoring_bypass_codes" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_sessions_exam_status" ON "exam_proctoring_sessions" ("exam_id", "status");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_events_participation_captured_at" ON "exam_proctoring_events" ("participation_id", "captured_at");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_events_exam_type_captured_at" ON "exam_proctoring_events" ("exam_id", "type", "captured_at");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_events_high_signal" ON "exam_proctoring_events" ("participation_id", "captured_at") WHERE "severity" IN ('warn', 'error', 'critical');
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_final_flush_participation_status" ON "exam_proctoring_final_flush_receipts" ("participation_id", "status");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_summaries_exam_risk" ON "exam_proctoring_summaries" ("exam_id", "risk_level");
CREATE INDEX IF NOT EXISTS "idx_proctoring_ai_jobs_claim" ON "proctoring_ai_jobs" ("status", "next_run_at", "priority");
CREATE INDEX IF NOT EXISTS "idx_proctoring_ai_jobs_participation" ON "proctoring_ai_jobs" ("participation_id");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_data_requests_candidate_status" ON "exam_proctoring_data_requests" ("candidate_user_id", "status", "requested_at");
CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_data_requests_participation" ON "exam_proctoring_data_requests" ("participation_id");

-- Verification note: Phase 1 risk and final-submit queries are participation-scoped.
-- Use idx_exam_proctoring_events_participation_captured_at for time-window
-- recompute and final-submit review. Phase 1 submit paths must not require a
-- global captured_at scan across all event partitions. payload_json is jsonb,
-- but there is intentionally no full-column GIN index on payload_json because
-- telemetry writes are high frequency and admin review relies on top-level
-- columns plus measured partial/expression indexes.
