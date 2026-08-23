-- Raise plan quotas to the updated PLAN_CATALOG.
-- Admin overrides (quota_source = admin) are left unchanged.
-- used_* counters are not reset.
UPDATE "users"
SET
	"processing_limit_minutes" = 45,
	"ai_answers_limit" = 30
WHERE "plan_code" = 'free'
	AND "quota_source" = 'plan';

UPDATE "users"
SET
	"processing_limit_minutes" = 300,
	"ai_answers_limit" = 500
WHERE "plan_code" = 'basic'
	AND "quota_source" = 'plan';

UPDATE "users"
SET
	"processing_limit_minutes" = 1500,
	"ai_answers_limit" = 2500
WHERE "plan_code" = 'pro'
	AND "quota_source" = 'plan';
