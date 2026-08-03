import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { appUser } from "../db/schema";
import type { Bindings } from "../types/bindings";

export type OpsUser = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  max_video_upload_size_mb: number;
  storage_limit_gb: number | null;
  processing_limit_minutes: number | null;
  ai_answers_limit: number | null;
  used_storage_bytes: number;
  used_processing_seconds: number;
  used_ai_answers: number;
  usage_period_start: string | null;
  is_over_quota: boolean;
};

const usagePeriodStartText = sql<string | null>`${appUser.usagePeriodStart}::text`.as(
  "usage_period_start",
);

const opsUserSelect = {
  id: appUser.id,
  username: appUser.username,
  email: appUser.email,
  is_active: appUser.isActive,
  is_staff: appUser.isStaff,
  is_superuser: appUser.isSuperuser,
  max_video_upload_size_mb: appUser.maxVideoUploadSizeMb,
  storage_limit_gb: appUser.storageLimitGb,
  processing_limit_minutes: appUser.processingLimitMinutes,
  ai_answers_limit: appUser.aiAnswersLimit,
  used_storage_bytes: appUser.usedStorageBytes,
  used_processing_seconds: appUser.usedProcessingSeconds,
  used_ai_answers: appUser.usedAiAnswers,
  usage_period_start: usagePeriodStartText,
  is_over_quota: appUser.isOverQuota,
};

function mapUser(r: {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  max_video_upload_size_mb: number;
  storage_limit_gb: number | null;
  processing_limit_minutes: number | null;
  ai_answers_limit: number | null;
  used_storage_bytes: number;
  used_processing_seconds: number;
  used_ai_answers: number;
  usage_period_start: string | null;
  is_over_quota: boolean;
}): OpsUser {
  return {
    id: Number(r.id),
    username: r.username,
    email: r.email,
    is_active: Boolean(r.is_active),
    is_staff: Boolean(r.is_staff),
    is_superuser: Boolean(r.is_superuser),
    max_video_upload_size_mb: Number(r.max_video_upload_size_mb),
    storage_limit_gb: r.storage_limit_gb === null ? null : Number(r.storage_limit_gb),
    processing_limit_minutes:
      r.processing_limit_minutes === null ? null : Number(r.processing_limit_minutes),
    ai_answers_limit: r.ai_answers_limit === null ? null : Number(r.ai_answers_limit),
    used_storage_bytes: Number(r.used_storage_bytes),
    used_processing_seconds: Number(r.used_processing_seconds),
    used_ai_answers: Number(r.used_ai_answers),
    usage_period_start: r.usage_period_start == null ? null : String(r.usage_period_start),
    is_over_quota: Boolean(r.is_over_quota),
  };
}

export async function isSuperuser(env: Bindings, userId: number): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ isSuperuser: appUser.isSuperuser })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    return rows.length > 0 && Boolean(rows[0].isSuperuser);
  });
}

export async function listOpsUsers(
  env: Bindings,
  q: string,
  limit: number,
  offset: number,
): Promise<{ count: number; results: OpsUser[] }> {
  return withDb(env, async (db) => {
    const whereClause = q
      ? or(ilike(appUser.username, `%${q}%`), ilike(appUser.email, `%${q}%`))
      : undefined;

    const [countRow] = await db
      .select({ c: count() })
      .from(appUser)
      .where(whereClause);

    const rows = await db
      .select(opsUserSelect)
      .from(appUser)
      .where(whereClause)
      .orderBy(asc(appUser.id))
      .limit(limit)
      .offset(offset);

    return {
      count: Number(countRow.c),
      results: rows.map(mapUser),
    };
  });
}

export async function getOpsUser(
  env: Bindings,
  userId: number,
): Promise<OpsUser | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select(opsUserSelect)
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  });
}

export type QuotaPatch = {
  max_video_upload_size_mb?: number;
  storage_limit_gb?: number | null;
  processing_limit_minutes?: number | null;
  ai_answers_limit?: number | null;
};

export type UsagePatch = {
  used_storage_bytes?: number;
  used_processing_seconds?: number;
  used_ai_answers?: number;
  usage_period_start?: string | null;
  is_over_quota?: boolean;
};

export async function patchOpsUserQuota(
  env: Bindings,
  userId: number,
  patch: QuotaPatch,
): Promise<OpsUser | null> {
  const set: Partial<{
    maxVideoUploadSizeMb: number;
    storageLimitGb: number | null;
    processingLimitMinutes: number | null;
    aiAnswersLimit: number | null;
  }> = {};
  if (patch.max_video_upload_size_mb !== undefined) {
    set.maxVideoUploadSizeMb = patch.max_video_upload_size_mb;
  }
  if (patch.storage_limit_gb !== undefined) set.storageLimitGb = patch.storage_limit_gb;
  if (patch.processing_limit_minutes !== undefined) {
    set.processingLimitMinutes = patch.processing_limit_minutes;
  }
  if (patch.ai_answers_limit !== undefined) set.aiAnswersLimit = patch.ai_answers_limit;
  if (Object.keys(set).length === 0) return getOpsUser(env, userId);

  return withDb(env, async (db) => {
    const rows = await db
      .update(appUser)
      .set(set)
      .where(eq(appUser.id, userId))
      .returning(opsUserSelect);
    return rows[0] ? mapUser(rows[0]) : null;
  });
}

export async function patchOpsUserUsage(
  env: Bindings,
  userId: number,
  patch: UsagePatch,
): Promise<OpsUser | null> {
  const set: Partial<{
    usedStorageBytes: number;
    usedProcessingSeconds: number;
    usedAiAnswers: number;
    usagePeriodStart: string | null;
    isOverQuota: boolean;
  }> = {};
  if (patch.used_storage_bytes !== undefined) set.usedStorageBytes = patch.used_storage_bytes;
  if (patch.used_processing_seconds !== undefined) {
    set.usedProcessingSeconds = patch.used_processing_seconds;
  }
  if (patch.used_ai_answers !== undefined) set.usedAiAnswers = patch.used_ai_answers;
  if (patch.usage_period_start !== undefined) set.usagePeriodStart = patch.usage_period_start;
  if (patch.is_over_quota !== undefined) set.isOverQuota = patch.is_over_quota;
  if (Object.keys(set).length === 0) return getOpsUser(env, userId);

  return withDb(env, async (db) => {
    const rows = await db
      .update(appUser)
      .set(set)
      .where(eq(appUser.id, userId))
      .returning(opsUserSelect);
    return rows[0] ? mapUser(rows[0]) : null;
  });
}
