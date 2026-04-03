CREATE TABLE "solution_approach_code_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approach_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"source_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_solution_approach_code_variants_approach_language" UNIQUE("approach_id","language_id")
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "language_id" uuid;--> statement-breakpoint
ALTER TABLE "solution_approach_code_variants" ADD CONSTRAINT "solution_approach_code_variants_approach_id_solution_approaches_id_fk" FOREIGN KEY ("approach_id") REFERENCES "public"."solution_approaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_approach_code_variants" ADD CONSTRAINT "solution_approach_code_variants_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_solution_approach_code_variants_approach_id" ON "solution_approach_code_variants" USING btree ("approach_id");--> statement-breakpoint
CREATE INDEX "idx_solution_approach_code_variants_language_id" ON "solution_approach_code_variants" USING btree ("language_id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_submissions_language_id" ON "submissions" USING btree ("language_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_language_id_submitted_at" ON "submissions" USING btree ("language_id","submitted_at");