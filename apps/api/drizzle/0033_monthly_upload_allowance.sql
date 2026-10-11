ALTER TABLE "users" ALTER COLUMN "max_video_upload_size_mb" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_upload_limit_gb" double precision DEFAULT 2;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "used_upload_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "upload_usage_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "upload_usage_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_monthly_upload_limit_check" CHECK (monthly_upload_limit_gb >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_used_upload_bytes_check" CHECK (used_upload_bytes >= 0);