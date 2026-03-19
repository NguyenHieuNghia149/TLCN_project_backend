ALTER TABLE "problems" ALTER COLUMN "function_signature" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "testcases" ALTER COLUMN "input_json" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "testcases" ALTER COLUMN "output_json" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" DROP COLUMN "judge_mode";