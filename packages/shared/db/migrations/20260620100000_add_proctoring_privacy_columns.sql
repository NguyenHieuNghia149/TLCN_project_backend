ALTER TABLE "exam_proctoring_settings"
  ADD COLUMN IF NOT EXISTS "llm_privacy_approved_at" timestamp,
  ADD COLUMN IF NOT EXISTS "llm_privacy_approved_by" varchar(100),
  ADD COLUMN IF NOT EXISTS "provider_dpa_reference" varchar(200);
