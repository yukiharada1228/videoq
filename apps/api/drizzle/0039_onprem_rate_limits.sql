CREATE TABLE "runtime_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"window_sec" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "runtime_rate_limits_expiry_idx" ON "runtime_rate_limits" USING btree ("expires_at");