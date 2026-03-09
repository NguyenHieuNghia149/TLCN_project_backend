ALTER TABLE "submissions" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "time_limit" integer DEFAULT 1000;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "memory_limit" varchar(20) DEFAULT '128m';--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "input" text;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "expected_output" text;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "point" real DEFAULT 0;