ALTER TABLE "proctoring_ai_jobs"
  DROP CONSTRAINT IF EXISTS "chk_proctoring_ai_jobs_job_type";

ALTER TABLE "proctoring_ai_jobs"
  ADD CONSTRAINT "chk_proctoring_ai_jobs_job_type"
  CHECK ("job_type" IN ('anomaly_prediction', 'anomaly_explanation', 'anomaly_recompute', 'llm_summary_generation'));

CREATE TABLE IF NOT EXISTS "exam_proctoring_llm_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id" uuid NOT NULL REFERENCES "exam"("id"),
  "participation_id" uuid NOT NULL REFERENCES "exam_participations"("id"),
  "deterministic_summary_id" uuid REFERENCES "exam_proctoring_summaries"("id"),
  "job_id" uuid REFERENCES "proctoring_ai_jobs"("id"),
  "provider" varchar(50) NOT NULL,
  "model_version" varchar(100) NOT NULL,
  "judge_model_version" varchar(100),
  "prompt_version" varchar(80) NOT NULL,
  "input_schema_version" varchar(80) NOT NULL,
  "output_schema_version" varchar(80) NOT NULL,
  "input_hash" varchar(64) NOT NULL,
  "status" varchar(40) DEFAULT 'pending' NOT NULL,
  "validation_status" varchar(40) DEFAULT 'not_run' NOT NULL,
  "validation_score" numeric(5, 4),
  "validation_errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary_json" jsonb,
  "risk_facts_json" jsonb,
  "missing_data_notes_json" jsonb,
  "model_notes_json" jsonb,
  "source_event_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "regeneration_of_id" uuid,
  "requested_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  CONSTRAINT "chk_exam_proctoring_llm_summaries_status"
    CHECK ("status" IN ('pending', 'accepted', 'validation_failed', 'provider_failed', 'skipped', 'dead_letter')),
  CONSTRAINT "chk_exam_proctoring_llm_summaries_validation_status"
    CHECK ("validation_status" IN ('not_run', 'passed', 'failed', 'skipped')),
  CONSTRAINT "chk_exam_proctoring_llm_summaries_provider"
    CHECK ("provider" IN ('local', 'ollama', 'vllm', 'llama_cpp', 'external', 'disabled'))
);

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_llm_summaries_participation"
  ON "exam_proctoring_llm_summaries" ("exam_id", "participation_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_llm_summaries_status"
  ON "exam_proctoring_llm_summaries" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_llm_summaries_model_prompt"
  ON "exam_proctoring_llm_summaries" ("model_version", "prompt_version");

CREATE INDEX IF NOT EXISTS "idx_exam_proctoring_llm_summaries_input"
  ON "exam_proctoring_llm_summaries" ("participation_id", "input_hash", "prompt_version", "model_version");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_proctoring_llm_summaries_active_input"
  ON "exam_proctoring_llm_summaries" ("participation_id", "input_hash", "prompt_version", "model_version")
  WHERE "status" IN ('pending', 'accepted');

ALTER TABLE "exam_proctoring_settings"
  ADD COLUMN IF NOT EXISTS "llm_summary_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "llm_summary_provider" varchar(50),
  ADD COLUMN IF NOT EXISTS "llm_summary_model_version" varchar(100),
  ADD COLUMN IF NOT EXISTS "llm_summary_prompt_version" varchar(80) DEFAULT 'proctoring-summary-v1' NOT NULL,
  ADD COLUMN IF NOT EXISTS "llm_summary_judge_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "llm_summary_min_validation_score" numeric(5, 4) DEFAULT 0.85 NOT NULL,
  ADD COLUMN IF NOT EXISTS "llm_summary_rate_limit_per_participation" integer DEFAULT 3 NOT NULL,
  ADD COLUMN IF NOT EXISTS "llm_summary_rate_limit_window_hours" integer DEFAULT 24 NOT NULL;

ALTER TABLE "exam_proctoring_settings"
  ADD CONSTRAINT "chk_exam_proctoring_settings_llm_summary_min_validation_score"
  CHECK ("llm_summary_min_validation_score" >= 0 AND "llm_summary_min_validation_score" <= 1);
