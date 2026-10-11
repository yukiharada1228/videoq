ALTER TABLE "videos" ADD COLUMN "multipart_upload" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "upload_heartbeat_at" timestamp with time zone;