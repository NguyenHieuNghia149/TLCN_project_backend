ALTER TABLE "users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "fk_users_banned_by_admin_id" FOREIGN KEY ("banned_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_status_banned_at" ON "users" USING btree ("status","banned_at");--> statement-breakpoint
CREATE INDEX "idx_users_banned_by_admin_id" ON "users" USING btree ("banned_by_admin_id");