CREATE TABLE "ai_answer_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"plan_code" text NOT NULL,
	"quota_source" text NOT NULL,
	"has_course" boolean NOT NULL,
	"streamed" boolean NOT NULL,
	"status" text NOT NULL,
	"quota_consumed" boolean,
	"provider_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "ai_answer_attempts_status_check" CHECK (status IN ('started', 'completed', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE INDEX "ai_answer_attempts_started_idx" ON "ai_answer_attempts" USING btree ("started_at");