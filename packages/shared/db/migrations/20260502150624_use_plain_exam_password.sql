ALTER TABLE "exam" ADD COLUMN "registration_password" text;--> statement-breakpoint
-- Legacy bcrypt hashes cannot be converted back to plaintext passwords.
-- Move affected exams back to draft/hidden so admins must set a new plaintext
-- registration_password before learners can access them again.
UPDATE "exam"
SET
  "is_visible" = false,
  "status" = 'draft',
  "self_registration_password_required" = false,
  "updated_at" = NOW()
WHERE "password_hash" IS NOT NULL
  AND "registration_password" IS NULL;--> statement-breakpoint
ALTER TABLE "exam" DROP COLUMN "password_hash";
