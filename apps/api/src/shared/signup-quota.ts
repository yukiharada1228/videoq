/**
 * Free-tier quotas applied when a new account is created via signup.
 * Override with DEFAULT_* / MAX_VIDEO_UPLOAD_SIZE_MB env vars.
 * Keep in sync with PLAN_CATALOG.free in features/billing/catalog.ts.
 *
 * Semantics for nullable limits:
 * - positive number → capped quota
 * - 0 → hard zero (cannot use)
 * - null → unlimited
 */

export type SignupQuotaDefaults = {
  maxVideoUploadSizeMb: number;
  storageLimitGb: number | null;
  processingLimitMinutes: number | null;
  aiAnswersLimit: number | null;
};

export const FREE_TIER_DEFAULTS = {
  maxVideoUploadSizeMb: 200,
  storageLimitGb: 1,
  processingLimitMinutes: 45,
  aiAnswersLimit: 30,
} as const;

/**
 * Parse a nullable numeric env limit.
 * - unset / empty → fallback
 * - "null" / "unlimited" → null (unlimited)
 * - finite number → that number
 */
export function parseNullableLimit(
  raw: string | undefined,
  fallback: number | null,
): number | null {
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "null" || v === "unlimited") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function resolveSignupQuotaDefaults(env: {
  MAX_VIDEO_UPLOAD_SIZE_MB?: string;
  DEFAULT_STORAGE_LIMIT_GB?: string;
  DEFAULT_PROCESSING_LIMIT_MINUTES?: string;
  DEFAULT_AI_ANSWERS_LIMIT?: string;
}): SignupQuotaDefaults {
  const maxMb =
    Number(env.MAX_VIDEO_UPLOAD_SIZE_MB ?? FREE_TIER_DEFAULTS.maxVideoUploadSizeMb) ||
    FREE_TIER_DEFAULTS.maxVideoUploadSizeMb;
  return {
    maxVideoUploadSizeMb: maxMb,
    storageLimitGb: parseNullableLimit(
      env.DEFAULT_STORAGE_LIMIT_GB,
      FREE_TIER_DEFAULTS.storageLimitGb,
    ),
    processingLimitMinutes: parseNullableLimit(
      env.DEFAULT_PROCESSING_LIMIT_MINUTES,
      FREE_TIER_DEFAULTS.processingLimitMinutes,
    ),
    aiAnswersLimit: parseNullableLimit(
      env.DEFAULT_AI_ANSWERS_LIMIT,
      FREE_TIER_DEFAULTS.aiAnswersLimit,
    ),
  };
}
