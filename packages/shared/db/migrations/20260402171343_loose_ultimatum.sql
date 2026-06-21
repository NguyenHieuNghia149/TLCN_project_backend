ALTER TABLE "submissions" ALTER COLUMN "language_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "solution_approaches" DROP COLUMN "code_variants";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN "language";