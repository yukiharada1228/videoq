import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { authSessions, users } from "../db/schema";
import type { Bindings } from "../types/bindings";

export type AdminUser = {
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

const usagePeriodStartText = sql<string | null>`${users.usagePeriodStart}::text`.as(
  "usage_period_start",
);

const adminUserSelect = {
  id: users.id,
  username: users.username,
  email: users.email,
  is_active: users.isActive,
  is_staff: users.isStaff,
  is_superuser: users.isSuperuser,
  max_video_upload_size_mb: users.maxVideoUploadSizeMb,
  storage_limit_gb: users.storageLimitGb,
  processing_limit_minutes: users.processingLimitMinutes,
  ai_answers_limit: users.aiAnswersLimit,
  used_storage_bytes: users.usedStorageBytes,
  used_processing_seconds: users.usedProcessingSeconds,
  used_ai_answers: users.usedAiAnswers,
  usage_period_start: usagePeriodStartText,
  is_over_quota: users.isOverQuota,
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
}): AdminUser {
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
      .select({ isSuperuser: users.isSuperuser })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows.length > 0 && Boolean(rows[0].isSuperuser);
  });
}

export async function listAdminUsers(
  env: Bindings,
  q: string,
  limit: number,
  offset: number,
): Promise<{ count: number; results: AdminUser[] }> {
  return withDb(env, async (db) => {
    const whereClause = q
      ? or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`))
      : undefined;

    const [countRow] = await db
      .select({ c: count() })
      .from(users)
      .where(whereClause);

    const rows = await db
      .select(adminUserSelect)
      .from(users)
      .where(whereClause)
      .orderBy(asc(users.id))
      .limit(limit)
      .offset(offset);

    return {
      count: Number(countRow.c),
      results: rows.map(mapUser),
    };
  });
}

export async function getAdminUser(
  env: Bindings,
  userId: number,
): Promise<AdminUser | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select(adminUserSelect)
      .from(users)
      .where(eq(users.id, userId))
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

export type FlagsPatch = {
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
};

export async function patchAdminUserQuota(
  env: Bindings,
  userId: number,
  patch: QuotaPatch,
): Promise<AdminUser | null> {
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
  if (Object.keys(set).length === 0) return getAdminUser(env, userId);

  return withDb(env, async (db) => {
    const rows = await db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning(adminUserSelect);
    return rows[0] ? mapUser(rows[0]) : null;
  });
}

export async function patchAdminUserFlags(
  env: Bindings,
  userId: number,
  patch: FlagsPatch,
): Promise<AdminUser | null> {
  const set: Partial<{
    isActive: boolean;
    isStaff: boolean;
    isSuperuser: boolean;
  }> = {};
  if (patch.is_active !== undefined) set.isActive = patch.is_active;
  if (patch.is_staff !== undefined) set.isStaff = patch.is_staff;
  if (patch.is_superuser !== undefined) set.isSuperuser = patch.is_superuser;
  if (Object.keys(set).length === 0) return getAdminUser(env, userId);

  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set(set)
        .where(eq(users.id, userId))
        .returning(adminUserSelect);
      const updated = rows[0] ? mapUser(rows[0]) : null;
      if (updated && patch.is_active === false) {
        await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      }
      return updated;
    });
  });
}

export async function lockUserForHardDelete(
  env: Bindings,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (updated.length === 0) return false;
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      return true;
    });
  });
}

export async function patchAdminUserUsage(
  env: Bindings,
  userId: number,
  patch: UsagePatch,
): Promise<AdminUser | null> {
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
  if (Object.keys(set).length === 0) return getAdminUser(env, userId);

  return withDb(env, async (db) => {
    const rows = await db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning(adminUserSelect);
    return rows[0] ? mapUser(rows[0]) : null;
  });
}
