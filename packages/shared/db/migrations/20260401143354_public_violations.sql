CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "languages_key_unique" UNIQUE("key")
);
--> statement-breakpoint
INSERT INTO "languages" ("key", "display_name", "sort_order", "is_active") VALUES
	('cpp', 'C++', 0, true),
	('java', 'Java', 1, true),
	('python', 'Python', 2, true)
ON CONFLICT ("key") DO UPDATE SET
	"display_name" = EXCLUDED."display_name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = EXCLUDED."is_active",
	"updated_at" = now();
--> statement-breakpoint
ALTER TABLE "solution_approaches" ADD COLUMN "code_variants" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "solution_approaches"
SET "code_variants" = jsonb_build_array(
	jsonb_build_object('language', "language", 'sourceCode', "source_code")
)
WHERE jsonb_array_length("code_variants") = 0
  AND "language" IS NOT NULL
  AND "source_code" IS NOT NULL;
