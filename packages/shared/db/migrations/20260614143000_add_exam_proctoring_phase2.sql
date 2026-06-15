CREATE TABLE IF NOT EXISTS "ai_proctoring_model_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "model_key" varchar(100) NOT NULL,
  "model_version" varchar(100) NOT NULL,
  "model_type" varchar(50) NOT NULL,
  "provider" varchar(50) NOT NULL,
  "artifact_uri" varchar(500) NOT NULL,
  "feature_schema_version" varchar(50) NOT NULL,
  "scoring_schema_version" varchar(50) NOT NULL,
  "training_data_snapshot_ref" varchar(200),
  "training_rows" integer DEFAULT 0 NOT NULL,
  "metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "thresholds_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "activated_at" timestamp,
  "retired_at" timestamp,
  CONSTRAINT "uq_ai_proctoring_model_versions_version" UNIQUE ("model_version"),
  CONSTRAINT "chk_ai_proctoring_model_versions_type"
    CHECK ("model_type" IN ('anomaly_detector', 'sequence_anomaly_detector', 'summary_generator', 'summary_judge')),
  CONSTRAINT "chk_ai_proctoring_model_versions_provider"
    CHECK ("provider" IN ('sklearn', 'internal', 'vllm', 'llama_cpp', 'ollama', 'external')),
  CONSTRAINT "chk_ai_proctoring_model_versions_status"
    CHECK ("status" IN ('draft', 'active', 'retired'))
);

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_type" varchar(20) NOT NULL,
  "actor_id" uuid REFERENCES "users"("id"),
  "action" varchar(80) NOT NULL,
  "target_type" varchar(80) NOT NULL,
  "target_id" uuid,
  "metadata" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_proctoring_model_versions_default"
  ON "ai_proctoring_model_versions" ("model_type")
  WHERE "is_default" = true;

CREATE INDEX IF NOT EXISTS "idx_ai_proctoring_model_versions_type_status"
  ON "ai_proctoring_model_versions" ("model_type", "status");

CREATE INDEX IF NOT EXISTS "idx_ai_proctoring_model_versions_key_status"
  ON "ai_proctoring_model_versions" ("model_key", "status");

ALTER TABLE "proctoring_ai_jobs"
  ADD COLUMN IF NOT EXISTS "job_type" varchar(50) DEFAULT 'anomaly_prediction' NOT NULL,
  ADD COLUMN IF NOT EXISTS "parent_job_id" uuid,
  ADD COLUMN IF NOT EXISTS "model_version" varchar(100),
  ADD COLUMN IF NOT EXISTS "feature_schema_version" varchar(50),
  ADD COLUMN IF NOT EXISTS "scoring_schema_version" varchar(50);

UPDATE "proctoring_ai_jobs"
SET "job_type" = 'anomaly_prediction'
WHERE "job_type" IS NULL;

ALTER TABLE "proctoring_ai_jobs"
  ADD CONSTRAINT "chk_proctoring_ai_jobs_job_type"
  CHECK ("job_type" IN ('anomaly_prediction', 'anomaly_explanation', 'anomaly_recompute'));

CREATE INDEX IF NOT EXISTS "idx_proctoring_ai_jobs_type_status"
  ON "proctoring_ai_jobs" ("job_type", "status");

CREATE TABLE IF NOT EXISTS "exam_proctoring_anomaly_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "session_id" uuid REFERENCES "exam_proctoring_sessions"("id"),
  "job_id" uuid NOT NULL REFERENCES "proctoring_ai_jobs"("id"),
  "window_id" varchar(120) NOT NULL,
  "window_start" timestamp NOT NULL,
  "window_end" timestamp NOT NULL,
  "model_version" varchar(100) NOT NULL,
  "feature_schema_version" varchar(50) NOT NULL,
  "scoring_schema_version" varchar(50) NOT NULL,
  "anomaly_score" real NOT NULL,
  "raw_score" real,
  "risk_level" varchar(20) NOT NULL,
  "explanation_status" varchar(30) DEFAULT 'not_requested' NOT NULL,
  "top_contributors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "explanation_skipped_reason" varchar(500),
  "source_event_range_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "explained_at" timestamp,
  CONSTRAINT "uq_exam_proctoring_anomaly_results_window_model"
    UNIQUE ("participation_id", "window_id", "model_version"),
  CONSTRAINT "chk_exam_proctoring_anomaly_results_score"
    CHECK ("anomaly_score" >= 0 AND "anomaly_score" <= 1),
  CONSTRAINT "chk_exam_proctoring_anomaly_results_risk"
    CHECK ("risk_level" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "chk_exam_proctoring_anomaly_results_explanation"
    CHECK ("explanation_status" IN ('not_requested', 'pending', 'completed', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_anomaly_results_participation_window"
  ON "exam_proctoring_anomaly_results" ("exam_id", "participation_id", "window_start");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_anomaly_results_exam_risk"
  ON "exam_proctoring_anomaly_results" ("exam_id", "risk_level", "window_start");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_anomaly_results_explanation"
  ON "exam_proctoring_anomaly_results" ("explanation_status", "risk_level");

CREATE TABLE IF NOT EXISTS "exam_proctoring_review_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "summary_id" uuid REFERENCES "exam_proctoring_summaries"("id"),
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id"),
  "review_outcome" varchar(50) NOT NULL,
  "evidence_confidence" varchar(20) NOT NULL,
  "notes" varchar(2000),
  "label_schema_version" varchar(50) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chk_exam_proctoring_review_labels_outcome"
    CHECK ("review_outcome" IN ('no_action_needed', 'follow_up_required', 'policy_review_required', 'inconclusive')),
  CONSTRAINT "chk_exam_proctoring_review_labels_confidence"
    CHECK ("evidence_confidence" IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_review_labels_exam_outcome"
  ON "exam_proctoring_review_labels" ("exam_id", "review_outcome");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_review_labels_participation_created"
  ON "exam_proctoring_review_labels" ("participation_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_proctoring_review_labels_reviewer_schema"
  ON "exam_proctoring_review_labels" ("participation_id", "reviewer_id", "label_schema_version");

CREATE TABLE IF NOT EXISTS "exam_proctoring_evaluation_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "model_version" varchar(100) NOT NULL,
  "feature_schema_version" varchar(50) NOT NULL,
  "scoring_schema_version" varchar(50) NOT NULL,
  "label_schema_version" varchar(50) NOT NULL,
  "dataset_snapshot_ref" varchar(200) NOT NULL,
  "sample_size" integer DEFAULT 0 NOT NULL,
  "positive_label_policy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "thresholds_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confusion_matrix_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "false_positive_examples_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "false_negative_examples_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "generated_by" varchar(100) NOT NULL,
  "generated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chk_exam_proctoring_evaluation_reports_status"
    CHECK ("status" IN ('draft', 'passed_gate', 'failed_gate', 'insufficient_sample'))
);

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_evaluation_reports_model_generated"
  ON "exam_proctoring_evaluation_reports" ("model_version", "generated_at");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_evaluation_reports_status_generated"
  ON "exam_proctoring_evaluation_reports" ("status", "generated_at");

ALTER TABLE "exam_proctoring_settings"
  ADD COLUMN IF NOT EXISTS "ai_advisory_visible" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "ai_minimum_evaluation_status" varchar(30) DEFAULT 'passed_gate' NOT NULL,
  ADD COLUMN IF NOT EXISTS "default_anomaly_model_version" varchar(100),
  ADD COLUMN IF NOT EXISTS "ai_anomaly_thresholds_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "shap_explanations_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "shap_minimum_risk_level" varchar(20) DEFAULT 'high' NOT NULL;

ALTER TABLE "exam_proctoring_settings"
  ADD CONSTRAINT "chk_exam_proctoring_settings_ai_minimum_evaluation_status"
  CHECK ("ai_minimum_evaluation_status" IN ('passed_gate'));

ALTER TABLE "exam_proctoring_settings"
  ADD CONSTRAINT "chk_exam_proctoring_settings_shap_minimum_risk_level"
  CHECK ("shap_minimum_risk_level" IN ('high', 'critical'));
