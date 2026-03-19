ALTER TABLE "problems" ADD COLUMN "judge_mode" varchar(32) DEFAULT 'stdin_stdout' NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "function_signature" jsonb;--> statement-breakpoint
ALTER TABLE "testcases" ADD COLUMN "input_json" jsonb;--> statement-breakpoint
ALTER TABLE "testcases" ADD COLUMN "output_json" jsonb;
--> statement-breakpoint
UPDATE "problems"
SET
  "judge_mode" = 'function_signature',
  "function_signature" = '{"methodName":"twoSum","parameters":[{"name":"nums","type":{"kind":"array","element":"int"}},{"name":"target","type":{"kind":"scalar","name":"int"}}],"returnType":{"kind":"array","element":"int"}}'::jsonb,
  "updated_at" = NOW()
WHERE "id" = '0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb';--> statement-breakpoint
UPDATE "testcases"
SET
  "input_json" = "input"::jsonb,
  "output_json" = "output"::jsonb,
  "input" = ("input"::jsonb)::text,
  "output" = ("output"::jsonb)::text,
  "updated_at" = NOW()
WHERE "problem_id" = '0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb';
