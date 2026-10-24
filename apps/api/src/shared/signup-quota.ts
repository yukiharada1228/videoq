import { features } from "../lib/deployment";
import type { Bindings } from "../types/bindings";
import { PLAN_CATALOG } from "../features/billing/catalog";

/**
 * Free-tier quotas applied when a new account is created via signup.
 * Override processing/storage/AI quotas with DEFAULT_* env vars.
 * MAX_VIDEO_UPLOAD_SIZE_MB is deprecated and ignored.
 * The plan catalog is the single source of free-tier defaults.
 *
 * Semantics for nullable limits:
 * - positive number → capped quota
 * - 0 → hard zero (cannot use)
 * - null → unlimited
 */

export type SignupQuotaDefaults = {
  maxVideoUploadSizeMb: number;
  storageLimitGb: number | null;
  monthlyUploadLimitGb: number | null;
  processingLimitMinutes: number | null;
  aiAnswersLimit: number | null;
};

/**
 * Parse a nullable numeric env limit.
 * - unset / empty → fallback
 * - "null" / "unlimited" → null (unlimited)
 * - finite nonnegative number → that number
 * - integer columns also require a PostgreSQL int4-compatible value
 */
export function parseNullableLimit(
  raw: string | undefined,
  fallback: number | null,
  { integer = false }: { integer?: boolean } = {},
): number | null {
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "null" || v === "unlimited") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 ||
    (integer && (!Number.isInteger(n) || n > 2_147_483_647))) return fallback;
  return n;
}

export function resolveSignupQuotaDefaults(env: Pick<Bindings, "RUNTIME" | "DEPLOYMENT_EDITION"> & {
  DEFAULT_MONTHLY_UPLOAD_LIMIT_GB?: string;
  MAX_VIDEO_UPLOAD_SIZE_MB?: string;
  DEFAULT_STORAGE_LIMIT_GB?: string;
  DEFAULT_PROCESSING_LIMIT_MINUTES?: string;
  DEFAULT_AI_ANSWERS_LIMIT?: string;
}): SignupQuotaDefaults {
  const defaults = features(env).billing ? PLAN_CATALOG.free.entitlements : {
    ...PLAN_CATALOG.free.entitlements, storageLimitGb: null, monthlyUploadLimitGb: null,
    processingLimitMinutes: null, aiAnswersLimit: null,
  };
  return {
    maxVideoUploadSizeMb: defaults.maxVideoUploadSizeMb,
    monthlyUploadLimitGb: parseNullableLimit(env.DEFAULT_MONTHLY_UPLOAD_LIMIT_GB, defaults.monthlyUploadLimitGb),
    storageLimitGb: parseNullableLimit(
      env.DEFAULT_STORAGE_LIMIT_GB,
      defaults.storageLimitGb,
    ),
    processingLimitMinutes: parseNullableLimit(
      env.DEFAULT_PROCESSING_LIMIT_MINUTES,
      defaults.processingLimitMinutes,
      { integer: true },
    ),
    aiAnswersLimit: parseNullableLimit(
      env.DEFAULT_AI_ANSWERS_LIMIT,
      defaults.aiAnswersLimit,
      { integer: true },
    ),
  };
}
