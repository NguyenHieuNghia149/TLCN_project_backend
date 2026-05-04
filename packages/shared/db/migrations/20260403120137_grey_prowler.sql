CREATE TABLE "exam_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" uuid,
	"action" varchar(50) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" uuid,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_entry_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"invite_id" uuid,
	"participation_id" uuid,
	"verification_method" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'opened' NOT NULL,
	"verified_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"user_id" uuid,
	"normalized_email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"source" varchar(30) NOT NULL,
	"approval_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"access_status" varchar(20),
	"approved_by" uuid,
	"invite_sent_at" timestamp,
	"joined_at" timestamp,
	"merged_into_participant_id" uuid,
	"merged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam" ALTER COLUMN "password" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "status" varchar(30) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "access_mode" varchar(30) DEFAULT 'open_registration' NOT NULL;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "self_registration_approval_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "self_registration_password_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "allow_external_candidates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "registration_open_at" timestamp;--> statement-breakpoint
ALTER TABLE "exam" ADD COLUMN "registration_close_at" timestamp;--> statement-breakpoint
ALTER TABLE "exam_participations" ADD COLUMN "participant_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_participations" ADD COLUMN "attempt_number" integer;--> statement-breakpoint
ALTER TABLE "exam_participations" ADD COLUMN "submitted_answers_snapshot" json;--> statement-breakpoint
ALTER TABLE "exam_participations" ADD COLUMN "answers_locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "exam_participations" ADD COLUMN "score_status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_shadow_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_audit_logs" ADD CONSTRAINT "exam_audit_logs_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_audit_logs" ADD CONSTRAINT "exam_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entry_sessions" ADD CONSTRAINT "exam_entry_sessions_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entry_sessions" ADD CONSTRAINT "exam_entry_sessions_participant_id_exam_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."exam_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entry_sessions" ADD CONSTRAINT "exam_entry_sessions_invite_id_exam_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."exam_invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_entry_sessions" ADD CONSTRAINT "exam_entry_sessions_participation_id_exam_participations_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."exam_participations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_invites" ADD CONSTRAINT "exam_invites_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_invites" ADD CONSTRAINT "exam_invites_participant_id_exam_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."exam_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_invites" ADD CONSTRAINT "exam_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exam_entry_sessions_exam_participant" ON "exam_entry_sessions" USING btree ("exam_id","participant_id");--> statement-breakpoint
CREATE INDEX "idx_exam_entry_sessions_participation" ON "exam_entry_sessions" USING btree ("participation_id");--> statement-breakpoint
CREATE INDEX "idx_exam_invites_exam_participant" ON "exam_invites" USING btree ("exam_id","participant_id");--> statement-breakpoint
CREATE INDEX "idx_exam_invites_token_hash" ON "exam_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exam_participants_exam_email" ON "exam_participants" USING btree ("exam_id","normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exam_participants_exam_user" ON "exam_participants" USING btree ("exam_id","user_id") WHERE "exam_participants"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_exam_participants_exam_access" ON "exam_participants" USING btree ("exam_id","access_status");--> statement-breakpoint
CREATE INDEX "idx_exam_participants_exam_approval" ON "exam_participants" USING btree ("exam_id","approval_status");--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_participations" ADD CONSTRAINT "exam_participations_participant_id_exam_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."exam_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exam_slug" ON "exam" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_exam_status_start_date" ON "exam" USING btree ("status","start_date");--> statement-breakpoint
CREATE INDEX "idx_exam_access_mode_status" ON "exam" USING btree ("access_mode","status");--> statement-breakpoint
CREATE INDEX "idx_exam_participations_participant" ON "exam_participations" USING btree ("participant_id");
