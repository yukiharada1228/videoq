-- drizzle-kit:custom
-- Monthly allowances begin with new reservations after this release. Existing
-- completed videos and in-flight reservations are not retroactively charged.
-- Keep administrator overrides unlimited until an administrator sets a limit.
UPDATE users SET monthly_upload_limit_gb = CASE
  WHEN quota_source = 'admin' THEN NULL
  WHEN plan_code = 'basic' AND subscription_status IN ('active', 'trialing', 'past_due') THEN 200
  WHEN plan_code = 'pro' AND subscription_status IN ('active', 'trialing', 'past_due') THEN 1000
  ELSE 2
END;
--> statement-breakpoint
-- Retain this compatibility column during rolling deploys, using R2's physical
-- ceiling uniformly. Neither new admission code nor the UI uses it as a quota.
UPDATE users SET max_video_upload_size_mb = 5237760;
