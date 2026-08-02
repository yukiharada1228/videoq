import { withDb } from "../db/pool";
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

const USER_SELECT = `SELECT id, username, email, is_active, is_staff, is_superuser,
         max_video_upload_size_mb, storage_limit_gb, processing_limit_minutes, ai_answers_limit,
         used_storage_bytes, used_processing_seconds, used_ai_answers,
         usage_period_start::text AS usage_period_start, is_over_quota
    FROM app_user`;

function mapUser(r: Record<string, unknown>): OpsUser {
  return {
    id: Number(r.id),
    username: String(r.username),
    email: String(r.email),
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT is_superuser FROM app_user WHERE id = $1`,
      [userId],
    );
    return rows.length > 0 && Boolean(rows[0].is_superuser);
  });
}

export async function listOpsUsers(
  env: Bindings,
  q: string,
  limit: number,
  offset: number,
): Promise<{ count: number; results: OpsUser[] }> {
  return withDb(env, async (db, client) => {
    const like = q ? `%${q}%` : null;
    const countRes = await client.query(
      like
        ? `SELECT count(*)::int AS c FROM app_user
            WHERE username ILIKE $1 OR email ILIKE $1`
        : `SELECT count(*)::int AS c FROM app_user`,
      like ? [like] : [],
    );
    const listRes = await client.query(
      like
        ? `${USER_SELECT}
            WHERE username ILIKE $1 OR email ILIKE $1
            ORDER BY id ASC LIMIT $2 OFFSET $3`
        : `${USER_SELECT} ORDER BY id ASC LIMIT $1 OFFSET $2`,
      like ? [like, limit, offset] : [limit, offset],
    );
    return {
      count: Number(countRes.rows[0].c),
      results: listRes.rows.map(mapUser),
    };
  });
}

export async function getOpsUser(
  env: Bindings,
  userId: number,
): Promise<OpsUser | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(`${USER_SELECT} WHERE id = $1`, [userId]);
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
  const sets: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.max_video_upload_size_mb !== undefined) {
    add("max_video_upload_size_mb", patch.max_video_upload_size_mb);
  }
  if (patch.storage_limit_gb !== undefined) add("storage_limit_gb", patch.storage_limit_gb);
  if (patch.processing_limit_minutes !== undefined) {
    add("processing_limit_minutes", patch.processing_limit_minutes);
  }
  if (patch.ai_answers_limit !== undefined) add("ai_answers_limit", patch.ai_answers_limit);
  if (sets.length === 0) return getOpsUser(env, userId);

  return withDb(env, async (db, client) => {
    args.push(userId);
    const { rows } = await client.query(
      `UPDATE app_user SET ${sets.join(", ")} WHERE id = $${args.length}
       RETURNING id, username, email, is_active, is_staff, is_superuser,
         max_video_upload_size_mb, storage_limit_gb, processing_limit_minutes, ai_answers_limit,
         used_storage_bytes, used_processing_seconds, used_ai_answers,
         usage_period_start::text AS usage_period_start, is_over_quota`,
      args,
    );
    return rows[0] ? mapUser(rows[0]) : null;
  });
}

export async function patchOpsUserUsage(
  env: Bindings,
  userId: number,
  patch: UsagePatch,
): Promise<OpsUser | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, val: unknown) => {
    args.push(val);
    sets.push(`${col} = $${args.length}`);
  };
  if (patch.used_storage_bytes !== undefined) add("used_storage_bytes", patch.used_storage_bytes);
  if (patch.used_processing_seconds !== undefined) {
    add("used_processing_seconds", patch.used_processing_seconds);
  }
  if (patch.used_ai_answers !== undefined) add("used_ai_answers", patch.used_ai_answers);
  if (patch.usage_period_start !== undefined) {
    add("usage_period_start", patch.usage_period_start);
  }
  if (patch.is_over_quota !== undefined) add("is_over_quota", patch.is_over_quota);
  if (sets.length === 0) return getOpsUser(env, userId);

  return withDb(env, async (db, client) => {
    args.push(userId);
    const { rows } = await client.query(
      `UPDATE app_user SET ${sets.join(", ")} WHERE id = $${args.length}
       RETURNING id, username, email, is_active, is_staff, is_superuser,
         max_video_upload_size_mb, storage_limit_gb, processing_limit_minutes, ai_answers_limit,
         used_storage_bytes, used_processing_seconds, used_ai_answers,
         usage_period_start::text AS usage_period_start, is_over_quota`,
      args,
    );
    return rows[0] ? mapUser(rows[0]) : null;
  });
}
