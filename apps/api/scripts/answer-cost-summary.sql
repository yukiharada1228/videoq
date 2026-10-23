-- Read-only daily input for reconciling answer attempts with OpenAI Costs.
-- Set the UTC range to match the billing export. Do not treat missing usage as zero cost.
WITH attempts AS (
  SELECT * FROM ai_answer_attempts
  WHERE started_at >= TIMESTAMPTZ '2026-10-15 00:00:00+00'
    AND started_at < TIMESTAMPTZ '2026-10-16 00:00:00+00'
), calls AS (
  SELECT a.id, a.plan_code, a.quota_source, a.status AS answer_status,
         c.value AS call
  FROM attempts a
  LEFT JOIN LATERAL jsonb_array_elements(a.provider_calls) c(value) ON true
)
SELECT plan_code, quota_source, answer_status,
       call->>'provider' AS provider, call->>'kind' AS call_kind, call->>'model' AS model,
       call->>'status' AS call_status,
       COUNT(*) AS provider_calls,
       COUNT(*) FILTER (WHERE call->'usage' IS NULL OR call->'usage' = 'null'::jsonb) AS calls_without_usage,
       SUM(COALESCE((call->'usage'->>'prompt_tokens')::bigint, 0)) AS input_tokens,
       SUM(COALESCE((call->'usage'->'prompt_tokens_details'->>'cached_tokens')::bigint, 0)) AS cached_input_tokens,
       SUM(COALESCE((call->'usage'->'prompt_tokens_details'->>'cache_write_tokens')::bigint, 0)) AS cache_write_tokens,
       SUM(COALESCE((call->'usage'->>'completion_tokens')::bigint, 0)) AS output_tokens,
       SUM(COALESCE((call->'usage'->>'total_tokens')::bigint, 0)) AS total_tokens
FROM calls
WHERE call IS NOT NULL
GROUP BY plan_code, quota_source, answer_status, provider, call_kind, model, call_status
ORDER BY plan_code, quota_source, answer_status, provider, call_kind, model, call_status;

-- Reconcile these answer outcomes separately; one answer can have several model calls.
SELECT plan_code, quota_source, status,
       COUNT(*) AS answer_attempts,
       COUNT(*) FILTER (WHERE quota_consumed) AS charged_quota,
       COUNT(*) FILTER (WHERE finished_at IS NULL) AS unfinished_attempts
FROM ai_answer_attempts
WHERE started_at >= TIMESTAMPTZ '2026-10-15 00:00:00+00'
  AND started_at < TIMESTAMPTZ '2026-10-16 00:00:00+00'
GROUP BY plan_code, quota_source, status
ORDER BY plan_code, quota_source, status;
