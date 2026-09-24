import { eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { users } from "../db/schema";
import type { Bindings } from "../types/bindings";

/**
 * `account.me` procedure のレスポンスを組み立てる。
 */
export type CurrentUser = {
  id: string;
  username: string;
  email: string;
  is_superuser: boolean;
  video_count: number;
  max_video_upload_size_mb: number;
  used_storage_bytes: number;
  storage_limit_bytes: number | null;
  used_processing_seconds: number;
  processing_limit_seconds: number | null;
  used_ai_answers: number;
  ai_answers_limit: number | null;
  is_over_quota: boolean;
  plan_code: "free" | "basic" | "pro";
  subscription_status: string | null;
  quota_source: "plan" | "admin";
};

const GIB = 1024 ** 3;

export async function getCurrentUser(
  env: Bindings,
  userId: string,
): Promise<CurrentUser | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        max_video_upload_size_mb: users.maxVideoUploadSizeMb,
        used_storage_bytes: users.usedStorageBytes,
        storage_limit_gb: users.storageLimitGb,
        used_processing_seconds: users.usedProcessingSeconds,
        processing_limit_minutes: users.processingLimitMinutes,
        used_ai_answers: users.usedAiAnswers,
        ai_answers_limit: users.aiAnswersLimit,
        is_over_quota: users.isOverQuota,
        plan_code: users.planCode,
        subscription_status: users.subscriptionStatus,
        quota_source: users.quotaSource,
        // Must be "users"."id": ${users.id} becomes bare "id" → videos.id in this subquery.
        video_count: sql<number>`(SELECT count(*)::int FROM videos v WHERE v.user_id = "users"."id")`.as(
          "video_count",
        ),
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];

    const storageLimitGb =
      r.storage_limit_gb === null ? null : Number(r.storage_limit_gb);
    const processingLimitMinutes =
      r.processing_limit_minutes === null ? null : Number(r.processing_limit_minutes);

    return {
      id: String(r.id),
      username: r.username,
      email: r.email,
      is_superuser: r.role?.split(",").includes("admin") ?? false,
      video_count: r.video_count,
      max_video_upload_size_mb: r.max_video_upload_size_mb,
      used_storage_bytes: Number(r.used_storage_bytes),
      storage_limit_bytes:
        storageLimitGb === null ? null : Math.trunc(storageLimitGb * GIB),
      used_processing_seconds: r.used_processing_seconds,
      processing_limit_seconds:
        processingLimitMinutes === null ? null : processingLimitMinutes * 60,
      used_ai_answers: r.used_ai_answers,
      ai_answers_limit: r.ai_answers_limit === null ? null : Number(r.ai_answers_limit),
      is_over_quota: r.is_over_quota,
      plan_code:
        r.plan_code === "basic" || r.plan_code === "pro" ? r.plan_code : "free",
      subscription_status: r.subscription_status,
      quota_source: r.quota_source === "admin" ? "admin" : "plan",
    };
  });
}

export async function getSearchApiKeyStatus(
  env: Bindings,
  userId: string,
): Promise<boolean | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ hasKey: sql<boolean>`COALESCE(${users.searchapiApiKeyEncrypted} <> '', false)` })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0]?.hasKey ?? null;
  });
}

export async function setSearchApiKey(
  env: Bindings,
  userId: string,
  encryptedValue: string | null,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(users)
      .set({ searchapiApiKeyEncrypted: encryptedValue, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return rows.length > 0;
  });
}
