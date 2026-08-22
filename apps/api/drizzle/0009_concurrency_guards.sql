ALTER TABLE "videos" ADD COLUMN "processing_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY video_id
           ORDER BY (status = 'running') DESC, id DESC
         ) AS position
    FROM plog_build_jobs
   WHERE status IN ('pending', 'running')
)
UPDATE plog_build_jobs AS jobs
   SET status = 'failed',
       error_message = 'Superseded while adding the active-job uniqueness guard.',
       updated_at = CURRENT_TIMESTAMP,
       finished_at = CURRENT_TIMESTAMP
  FROM ranked
 WHERE jobs.id = ranked.id
   AND ranked.position > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "plog_build_jobs_video_active_uniq" ON "plog_build_jobs" USING btree ("video_id") WHERE status IN ('pending', 'running');--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_processing_seconds_check" CHECK (processing_seconds >= 0);
