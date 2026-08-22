CREATE TABLE "job_executions" (
	"job_id" varchar(128) PRIMARY KEY NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"payload_sha256" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" varchar(36),
	"lease_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_executions_status_check" CHECK (status IN ('running', 'failed', 'completed')),
	CONSTRAINT "job_executions_attempts_check" CHECK (attempts >= 0)
);
--> statement-breakpoint
DROP INDEX "external_tasks_ready_idx";--> statement-breakpoint
ALTER TABLE "external_tasks" ADD COLUMN "dead_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "job_executions_completed_idx" ON "job_executions" USING btree ("completed_at","job_id") WHERE completed_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "external_tasks_completed_idx" ON "external_tasks" USING btree ("completed_at","id") WHERE completed_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "external_tasks_ready_idx" ON "external_tasks" USING btree ("available_at","id") WHERE completed_at IS NULL AND dead_at IS NULL;