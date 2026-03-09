CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text,
	"topic_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"difficult" varchar(20) DEFAULT 'easy' NOT NULL,
	"constraint" text,
	"tags" text,
	"lesson_id" uuid,
	"topic_id" uuid
);
--> statement-breakpoint
CREATE TABLE "testcases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input" text NOT NULL,
	"output" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"point" integer DEFAULT 0 NOT NULL,
	"problem_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"video_url" varchar(1024),
	"image_url" varchar(1024),
	"source_code" text,
	"description" text,
	"problem_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_code" text NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"language" varchar(50) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actual_output" text,
	"is_passed" boolean DEFAULT false NOT NULL,
	"execution_time" real,
	"memory_use" real,
	"testcase_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testcases" ADD CONSTRAINT "testcases_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_testcase_id_testcases_id_fk" FOREIGN KEY ("testcase_id") REFERENCES "public"."testcases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;