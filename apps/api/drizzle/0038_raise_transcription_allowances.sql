-- drizzle-kit:custom
-- Increase the monthly transcription allowance for plan-managed accounts.
-- Preserve administrator overrides, recorded usage, answer quotas, and all
-- other entitlements. Reapplying this migration does not rewrite unchanged rows.
WITH target AS (
    SELECT id, CASE plan_code
        WHEN 'free' THEN 120
        WHEN 'basic' THEN 500
        WHEN 'pro' THEN 1500
    END AS new_limit
    FROM users
    WHERE quota_source = 'plan'
      AND (plan_code = 'free'
           OR (plan_code IN ('basic', 'pro')
               AND subscription_status IN ('active', 'trialing', 'past_due')))
)
UPDATE users AS u
SET processing_limit_minutes = target.new_limit,
    updated_at = clock_timestamp()
FROM target
WHERE u.id = target.id
  AND u.processing_limit_minutes IS DISTINCT FROM target.new_limit;
