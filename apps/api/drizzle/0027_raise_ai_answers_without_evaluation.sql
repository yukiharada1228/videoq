-- drizzle-kit:custom
-- RAGAS retirement funds additional answers at the existing prices.
-- Preserve administrative overrides, all other limits, and used_* counters.
-- Only usable paid plans gain capacity. Updated revisions invalidate racing
-- Stripe reconciliations that read the pre-migration entitlement state.
UPDATE "users"
SET "ai_answers_limit" = CASE "plan_code"
        WHEN 'basic' THEN 1800
        WHEN 'pro' THEN 2800
    END,
    "updated_at" = clock_timestamp()
WHERE "quota_source" = 'plan'
    AND "plan_code" IN ('basic', 'pro')
    AND "subscription_status" IN ('active', 'trialing', 'past_due')
    AND "ai_answers_limit" IS DISTINCT FROM CASE "plan_code"
        WHEN 'basic' THEN 1800
        WHEN 'pro' THEN 2800
    END;
