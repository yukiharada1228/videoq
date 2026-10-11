CREATE TABLE "video_transcription_chunks" (
	"run_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"segments" jsonb,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_transcription_chunks_run_id_chunk_index_pk" PRIMARY KEY("run_id","chunk_index"),
	CONSTRAINT "video_transcription_chunks_index_check" CHECK ("video_transcription_chunks"."chunk_index" >= 0),
	CONSTRAINT "video_transcription_chunks_failures_check" CHECK ("video_transcription_chunks"."failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "video_transcription_runs" (
	"video_id" bigint PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"file_key" varchar(100) NOT NULL,
	"transcript_hash" varchar(32) NOT NULL,
	"duration_ms" bigint NOT NULL,
	"chunk_seconds" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_transcription_runs_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "video_transcription_runs_duration_check" CHECK ("video_transcription_runs"."duration_ms" > 0),
	CONSTRAINT "video_transcription_runs_chunks_check" CHECK ("video_transcription_runs"."chunk_seconds" > 0 AND "video_transcription_runs"."chunk_count" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
ALTER TABLE "video_transcription_chunks" ADD CONSTRAINT "video_transcription_chunks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."video_transcription_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_transcription_runs" ADD CONSTRAINT "video_transcription_runs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;