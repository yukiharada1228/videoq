CREATE TABLE "video_visual_chunks" (
	"run_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"frame_count" integer,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_visual_chunks_run_id_chunk_index_pk" PRIMARY KEY("run_id","chunk_index"),
	CONSTRAINT "video_visual_chunks_index_check" CHECK ("video_visual_chunks"."chunk_index" BETWEEN 0 AND 599),
	CONSTRAINT "video_visual_chunks_frames_check" CHECK ("video_visual_chunks"."frame_count" IS NULL OR "video_visual_chunks"."frame_count" BETWEEN 0 AND 60),
	CONSTRAINT "video_visual_chunks_failures_check" CHECK ("video_visual_chunks"."failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "video_visual_runs" (
	"video_id" bigint PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"file_key" varchar(100) NOT NULL,
	"duration_ms" bigint NOT NULL,
	"chunk_count" integer NOT NULL,
	"status" varchar(16) DEFAULT 'processing' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_visual_runs_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "video_visual_runs_duration_check" CHECK ("video_visual_runs"."duration_ms" > 0 AND "video_visual_runs"."duration_ms" <= 36000000),
	CONSTRAINT "video_visual_runs_chunks_check" CHECK ("video_visual_runs"."chunk_count" BETWEEN 1 AND 600),
	CONSTRAINT "video_visual_runs_status_check" CHECK ("video_visual_runs"."status" IN ('processing', 'ready', 'error'))
);
--> statement-breakpoint
ALTER TABLE "video_visual_chunks" ADD CONSTRAINT "video_visual_chunks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."video_visual_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_visual_runs" ADD CONSTRAINT "video_visual_runs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;