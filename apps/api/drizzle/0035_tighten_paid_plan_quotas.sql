-- drizzle-kit:custom
-- Apply the lower paid allowances immediately to plan-managed, usable
-- subscriptions. Preserve admin overrides, recorded usage, storage and upload
-- allowances. A user already above a new limit cannot reserve more usage until
-- the normal UTC monthly reset; no previous usage is erased.
UPDATE "users"
SET "processing_limit_minutes" = CASE "plan_code"
        WHEN 'basic' THEN 200
        WHEN 'pro' THEN 1000
    END,
    "ai_answers_limit" = CASE "plan_code"
        WHEN 'basic' THEN 500
        WHEN 'pro' THEN 2000
    END,
    "updated_at" = clock_timestamp()
WHERE "quota_source" = 'plan'
    AND "plan_code" IN ('basic', 'pro')
    AND "subscription_status" IN ('active', 'trialing', 'past_due')
    AND (
        "processing_limit_minutes" IS DISTINCT FROM CASE "plan_code"
            WHEN 'basic' THEN 200
            WHEN 'pro' THEN 1000
        END
        OR "ai_answers_limit" IS DISTINCT FROM CASE "plan_code"
            WHEN 'basic' THEN 500
            WHEN 'pro' THEN 2000
        END
    );
