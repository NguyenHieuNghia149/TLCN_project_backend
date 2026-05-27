CREATE INDEX IF NOT EXISTS "idx_exam_participations_exam_status" ON "exam_participations" USING btree ("exam_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_visible_status_created_at" ON "exam" USING btree ("is_visible","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created_at" ON "notifications" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
DROP INDEX IF EXISTS "idx_submissions_accepted_solved_lookup";--> statement-breakpoint
CREATE INDEX "idx_submissions_accepted_solved_lookup" ON "submissions" USING btree ("user_id","problem_id") WHERE "submissions"."status" = 'accepted' AND "submissions"."exam_participation_id" IS NULL;
