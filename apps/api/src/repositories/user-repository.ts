import { and, eq, ne, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { users } from "../db/schema";
import { verifyPassword, hashPassword } from "../lib/password";
import { resolveSignupQuotaDefaults } from "../shared/signup-quota";
import type { Bindings } from "../types/bindings";

const lastLoginUtc = sql<string | null>`to_char(${users.lastLogin} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`.as(
  "last_login",
);

/**
 * トークン検証用にユーザーを取得（check_token の hash_value に必要な項目）。
 * last_login は秒精度でタイムゾーン接尾辞を付けない UTC 表記
 * 'YYYY-MM-DD HH24:MI:SS'（None は null）。不在は null。
 */
export async function getUserForToken(
  env: Bindings,
  pk: number,
): Promise<{ id: number; password: string; email: string; lastLogin: string | null } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        password: users.password,
        email: users.email,
        last_login: lastLoginUtc,
      })
      .from(users)
      .where(eq(users.id, pk))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      password: r.password,
      email: r.email,
      lastLogin: r.last_login ?? null,
    };
  });
}

/**
 * 大文字小文字を無視して最初の active user id を返す。
 * 再設定リンク生成に必要な項目まで一度に取る。last_login の形式は getUserForToken と同じ。
 */
export async function findActiveUserByEmail(
  env: Bindings,
  email: string,
): Promise<{ id: number; password: string; email: string; lastLogin: string | null } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        password: users.password,
        email: users.email,
        last_login: lastLoginUtc,
      })
      .from(users)
      .where(
        and(
          sql`upper(${users.email}::text) = upper(${email})`,
          eq(users.isActive, true),
        ),
      )
      .orderBy(users.id)
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    const id = Number(r.id);
    if (!Number.isSafeInteger(id)) return null; // uid に別 user の pk を載せない
    return {
      id,
      password: r.password,
      email: r.email,
      lastLogin: r.last_login ?? null,
    };
  });
}

/** activate_user: 非アクティブなら is_active=true にする。 */
export async function activateUser(env: Bindings, pk: number): Promise<void> {
  return withDb(env, async (db) => {
    await db
      .update(users)
      .set({ isActive: true })
      .where(and(eq(users.id, pk), eq(users.isActive, false)));
  });
}

/** set_password: make_password でハッシュ化して password を更新。 */
export async function setUserPassword(
  env: Bindings,
  pk: number,
  newPassword: string,
): Promise<void> {
  const hashed = await hashPassword(newPassword);
  return withDb(env, async (db) => {
    await db
      .update(users)
      .set({ password: hashed, passwordResetRequired: false })
      .where(eq(users.id, pk));
  });
}

/**
 * メール変更トークンの検証に必要な項目（EmailChangeTokenGenerator は pending_email も hash に含む）。
 * 不在は null。
 */
export async function getUserForEmailChange(
  env: Bindings,
  pk: number,
): Promise<{
  id: number;
  password: string;
  email: string;
  pendingEmail: string | null;
  lastLogin: string | null;
} | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        password: users.password,
        email: users.email,
        pending_email: users.pendingEmail,
        last_login: lastLoginUtc,
      })
      .from(users)
      .where(eq(users.id, pk))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      password: r.password,
      email: r.email,
      pendingEmail: r.pending_email ?? null,
      lastLogin: r.last_login ?? null,
    };
  });
}

/** set_pending_email: 確認が済むまで新アドレスを保持する。 */
export async function setPendingEmail(
  env: Bindings,
  pk: number,
  email: string,
): Promise<void> {
  return withDb(env, async (db) => {
    await db.update(users).set({ pendingEmail: email }).where(eq(users.id, pk));
  });
}

/**
 * pending_email を email へ確定（confirm_pending_email の後半）。
 * 他ユーザーが同じアドレスを使っていれば false。
 * 1 トランザクションに閉じ、競合した一意制約違反(23505)も false に倒す。
 */
export async function confirmPendingEmail(
  env: Bindings,
  pk: number,
  pendingEmail: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    try {
      return await db.transaction(async (tx) => {
        const taken = await tx
          .select({ one: sql<number>`1` })
          .from(users)
          .where(
            and(
              sql`upper(${users.email}::text) = upper(${pendingEmail})`,
              ne(users.id, pk),
            ),
          )
          .limit(1);
        if (taken.length > 0) return false;
        await tx
          .update(users)
          .set({ email: pendingEmail, pendingEmail: null })
          .where(eq(users.id, pk));
        return true;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return false; // IntegrityError
      throw e;
    }
  });
}

/** normalized_email は lower 済みとして大文字小文字を無視して検索する。 */
export async function emailExists(
  env: Bindings,
  email: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ one: sql<number>`1` })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * メール確認前の非アクティブユーザーを作成する。
 * password はハッシュ化、無料枠デフォルト（env 上書き可）を明示 INSERT。作成 id を返す。
 * username/email の一意制約違反(23505)は現行同様 500（呼び出し側で握らない）。
 */
export async function createInactiveUser(
  env: Bindings,
  username: string,
  normalizedEmail: string,
  password: string,
): Promise<{ id: number }> {
  const hashed = await hashPassword(password);
  const quota = resolveSignupQuotaDefaults(env);
  return withDb(env, async (db) => {
    const rows = await db
      .insert(users)
      .values({
        password: hashed,
        lastLogin: null,
        isSuperuser: false,
        username,
        firstName: "",
        lastName: "",
        isStaff: false,
        isActive: false,
        dateJoined: sql`CURRENT_TIMESTAMP`,
        email: normalizedEmail,
        deactivatedAt: null,
        maxVideoUploadSizeMb: quota.maxVideoUploadSizeMb,
        searchapiApiKeyEncrypted: null,
        aiAnswersLimit: quota.aiAnswersLimit,
        isOverQuota: false,
        processingLimitMinutes: quota.processingLimitMinutes,
        storageLimitGb: quota.storageLimitGb,
        usagePeriodStart: sql`CURRENT_TIMESTAMP`,
        usedAiAnswers: 0,
        usedProcessingSeconds: 0,
        usedStorageBytes: 0,
        pendingEmail: null,
        passwordResetRequired: false,
      })
      .returning({ id: users.id });
    return { id: Number(rows[0].id) };
  });
}

/** has_searchapi_api_key: 値の中身は見ず NULL かどうかだけ（復号不要）。ユーザー不在は null。 */
export async function getSearchApiKeyStatus(
  env: Bindings,
  userId: number,
): Promise<boolean | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        has_api_key: sql<boolean>`${users.searchapiApiKeyEncrypted} IS NOT NULL`.as("has_api_key"),
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows.length === 0 ? null : rows[0].has_api_key;
  });
}

/**
 * Store a versioned encrypted envelope. Updating a missing user returns false.
 */
export async function setSearchApiKey(
  env: Bindings,
  userId: number,
  encryptedValue: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(users)
      .set({ searchapiApiKeyEncrypted: encryptedValue })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return rows.length > 0;
  });
}

/** delete_searchapi_api_key: NULL 化。更新行が無ければ false。 */
export async function deleteSearchApiKey(
  env: Bindings,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(users)
      .set({ searchapiApiKeyEncrypted: null })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return rows.length > 0;
  });
}

/**
 * `/api/auth/me` のレスポンスを組み立てる。
 * 派生値は quota の現在値から計算する:
 *   storage_limit_bytes = storage_limit_gb === null ? null : trunc(gb * 1024^3)
 *   processing_limit_seconds = processing_limit_minutes === null ? null : minutes * 60
 */
export type CurrentUser = {
  id: number;
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
  userId: number,
): Promise<CurrentUser | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        is_superuser: users.isSuperuser,
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
      // PostgreSQL ドライバは bigint を文字列で返すため Number 化する。
      id: Number(r.id),
      username: r.username,
      email: r.email,
      is_superuser: Boolean(r.is_superuser),
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

/**
 * Authenticate an active user whose password has been migrated to the native format.
 */
export async function authenticateUser(
  env: Bindings,
  username: string,
  password: string,
): Promise<number | null> {
  const row = await withDb(env, async (db) => {
    const rows = await db
      .select({
        id: users.id,
        password: users.password,
        is_active: users.isActive,
        password_reset_required: users.passwordResetRequired,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  if (row.password_reset_required) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  const ok = await verifyPassword(password, row.password);
  if (!ok) return null;
  if (!row.is_active) return null; // user_can_authenticate（is_active）
  // pg は bigint を文字列で返す。安全整数外なら JWT に別 user の id が入る事故を防ぐため fail-closed。
  const id = Number(row.id);
  if (!Number.isSafeInteger(id)) return null;
  return id;
}

const DUMMY_PASSWORD_HASH =
  "vqpw$1$100000$AQEBAQEBAQEBAQEBAQEBAQ$RIY27gMo_hsM9E0aOW8ni5W0AiM_fXS_WyAoZdGf8tw";
