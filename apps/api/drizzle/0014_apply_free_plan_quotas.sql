-- Backfill existing Free users onto PLAN_CATALOG.free.
-- Admin overrides (quota_source = admin) and paid plans are left unchanged.
-- used_* counters are not reset.
UPDATE "users"
SET
	"max_video_upload_size_mb" = 200,
	"storage_limit_gb" = 1,
	"processing_limit_minutes" = 10,
	"ai_answers_limit" = 15
WHERE "plan_code" = 'free'
	AND "quota_source" = 'plan';
