import { eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { users } from "../db/schema";
import type { Bindings } from "../types/bindings";

/**
 * `/api/account/me` のレスポンスを組み立てる。
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
        is_superuser: users.isSuperuser,
        role: users.role,
        max_video_upload_size_mb: users.maxVideoUploadSizeMb,
        used_storage_bytes: users.usedStorageBytes,
        storage_limit_gb: users.storageLimitGb,
        used_processing_seconds: users.usedProcessingSeconds,
        processing_limit_minutes: users.processingLimitMinutes,
        used_ai_answers: users.usedAiAnswers,
        ai_answers_limit: users.aiAnswersLimit,
        is_over_quota: users.isOverQuota,
        video_count: sql<number>`(SELECT count(*)::int FROM videos v WHERE v.user_id = ${users.id})`.as(
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
      is_superuser: Boolean(r.is_superuser) || r.role === "admin",
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
    };
  });
}

export async function getSearchApiKeyStatus(
  env: Bindings,
  userId: string,
): Promise<boolean | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ key: users.searchapiApiKeyEncrypted })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (rows.length === 0) return null;
    return rows[0].key != null && rows[0].key.length > 0;
  });
}

export async function setSearchApiKey(
  env: Bindings,
  userId: string,
  encryptedValue: string,
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

export async function deleteSearchApiKey(
  env: Bindings,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(users)
      .set({ searchapiApiKeyEncrypted: null, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return rows.length > 0;
  });
}
