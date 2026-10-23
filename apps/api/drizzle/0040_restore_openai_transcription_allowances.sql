-- drizzle-kit:custom
-- Restore the exact pre-Modal monthly transcription allowances (5b3ed5b4^).
-- Preserve administrative overrides, recorded usage, and every other entitlement.
WITH target AS (
    SELECT id, CASE plan_code
        WHEN 'free' THEN 45
        WHEN 'basic' THEN 200
        WHEN 'pro' THEN 1000
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
