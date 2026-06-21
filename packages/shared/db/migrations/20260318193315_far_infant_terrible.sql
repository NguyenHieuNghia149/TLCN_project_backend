CREATE INDEX IF NOT EXISTS "idx_comments_lesson_parent" ON "comments" USING btree ("lesson_id","parent_comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comments_problem_parent" ON "comments" USING btree ("problem_id","parent_comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comments_parent" ON "comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_learned_lessons_user_lesson" ON "learned_lessons" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_learned_lessons_lesson_id" ON "learned_lessons" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_visible_created_at" ON "exam" USING btree ("is_visible","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exam_participations_exam_user" ON "exam_participations" USING btree ("exam_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lessons_topic_id" ON "lessons" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_problems_topic_visibility_created_id" ON "problems" USING btree ("topic_id","visibility","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_testcases_problem_id" ON "testcases" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_user_submitted_at" ON "submissions" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_problem_submitted_at" ON "submissions" USING btree ("problem_id","submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_status_submitted_at" ON "submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_user_problem_submitted_at" ON "submissions" USING btree ("user_id","problem_id","submitted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_submissions_accepted_solved_lookup" ON "submissions" USING btree ("user_id","problem_id") WHERE "submissions"."status" = 'ACCEPTED' AND "submissions"."exam_participation_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_result_submissions_submission_testcase" ON "result_submissions" USING btree ("submission_id","testcase_id");