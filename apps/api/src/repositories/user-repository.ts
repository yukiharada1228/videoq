import { and, eq, ne, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { appAccountdeletionrequest, appUser } from "../db/schema";
import { verifyDjangoPassword, hashDjangoPassword } from "../lib/password";
import type { Bindings } from "../types/bindings";

const lastLoginUtc = sql<string | null>`to_char(${appUser.lastLogin} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`.as(
  "last_login",
);

/**
 * アカウント削除の開始（AccountDeletionUseCase 相当）。tx で:
 *   1. AccountDeletionRequest を記録（reason）
 *   2. ユーザーを匿名化 + 非アクティブ化（is_active=false, deactivated_at, username/email を deleted__<hex>）
 * enqueue は呼び出し側で commit 後に実行する。
 */
export async function requestAccountDeletion(
  env: Bindings,
  userId: number,
  reason: string,
): Promise<void> {
  const hex = crypto.randomUUID().replace(/-/g, ""); // uuid4().hex（username/email 共通）
  return withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await tx.insert(appAccountdeletionrequest).values({
        userId,
        reason,
        requestedAt: sql`CURRENT_TIMESTAMP`,
      });
      await tx
        .update(appUser)
        .set({
          isActive: false,
          deactivatedAt: sql`now()`,
          username: `deleted__${hex}`,
          email: `deleted__${hex}@invalid.local`,
        })
        .where(eq(appUser.id, userId));
    });
  });
}

/**
 * トークン検証用にユーザーを取得（check_token の hash_value に必要な項目）。
 * last_login は Django の str(replace(microsecond=0, tzinfo=None)) と一致する UTC 表記
 * 'YYYY-MM-DD HH24:MI:SS'（None は null）。不在は null。
 */
export async function getUserForToken(
  env: Bindings,
  pk: number,
): Promise<{ id: number; password: string; email: string; lastLogin: string | null } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appUser.id,
        password: appUser.password,
        email: appUser.email,
        last_login: lastLoginUtc,
      })
      .from(appUser)
      .where(eq(appUser.id, pk))
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
 * find_active_user_id_by_email 相当（`email__iexact` + `is_active=True`, `order_by("id").first()`）。
 * 再設定リンク生成に必要な項目まで一度に取る。last_login の形式は getUserForToken と同じ。
 */
export async function findActiveUserByEmail(
  env: Bindings,
  email: string,
): Promise<{ id: number; password: string; email: string; lastLogin: string | null } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appUser.id,
        password: appUser.password,
        email: appUser.email,
        last_login: lastLoginUtc,
      })
      .from(appUser)
      .where(
        and(
          sql`upper(${appUser.email}::text) = upper(${email})`,
          eq(appUser.isActive, true),
        ),
      )
      .orderBy(appUser.id)
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
      .update(appUser)
      .set({ isActive: true })
      .where(and(eq(appUser.id, pk), eq(appUser.isActive, false)));
  });
}

/** set_password: make_password でハッシュ化して password を更新。 */
export async function setUserPassword(
  env: Bindings,
  pk: number,
  newPassword: string,
): Promise<void> {
  const hashed = await hashDjangoPassword(newPassword);
  return withDb(env, async (db) => {
    await db.update(appUser).set({ password: hashed }).where(eq(appUser.id, pk));
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
        id: appUser.id,
        password: appUser.password,
        email: appUser.email,
        pending_email: appUser.pendingEmail,
        last_login: lastLoginUtc,
      })
      .from(appUser)
      .where(eq(appUser.id, pk))
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
    await db.update(appUser).set({ pendingEmail: email }).where(eq(appUser.id, pk));
  });
}

/**
 * pending_email を email へ確定（confirm_pending_email の後半）。
 * 他ユーザーが同じアドレスを使っていれば false。Django は exists() 後に save するが、
 * ここは 1 トランザクションに閉じ、競合した一意制約違反(23505)も false に倒す。
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
          .from(appUser)
          .where(
            and(
              sql`upper(${appUser.email}::text) = upper(${pendingEmail})`,
              ne(appUser.id, pk),
            ),
          )
          .limit(1);
        if (taken.length > 0) return false;
        await tx
          .update(appUser)
          .set({ email: pendingEmail, pendingEmail: null })
          .where(eq(appUser.id, pk));
        return true;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return false; // IntegrityError
      throw e;
    }
  });
}

/** email__iexact 相当（大文字小文字無視）。normalized_email は既に lower 前提。 */
export async function emailExists(
  env: Bindings,
  email: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ one: sql<number>`1` })
      .from(appUser)
      .where(sql`lower(${appUser.email}) = lower(${email})`)
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * 非アクティブユーザー作成（create_user(is_active=False) 相当）。
 * password は make_password でハッシュ化、モデル既定値を明示 INSERT。作成 id を返す。
 * username/email の一意制約違反(23505)は現行同様 500（呼び出し側で握らない）。
 */
export async function createInactiveUser(
  env: Bindings,
  username: string,
  normalizedEmail: string,
  password: string,
): Promise<{ id: number; passwordHash: string }> {
  const hashed = await hashDjangoPassword(password);
  const maxMb = Number(env.MAX_VIDEO_UPLOAD_SIZE_MB ?? 500) || 500;
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appUser)
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
        maxVideoUploadSizeMb: maxMb,
        searchapiApiKeyEncrypted: null,
        aiAnswersLimit: 0,
        isOverQuota: false,
        processingLimitMinutes: 0,
        storageLimitGb: 0,
        usagePeriodStart: null,
        usedAiAnswers: 0,
        usedProcessingSeconds: 0,
        usedStorageBytes: 0,
        pendingEmail: null,
      })
      .returning({ id: appUser.id });
    return { id: Number(rows[0].id), passwordHash: hashed };
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
        has_api_key: sql<boolean>`${appUser.searchapiApiKeyEncrypted} IS NOT NULL`.as("has_api_key"),
      })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    return rows.length === 0 ? null : rows[0].has_api_key;
  });
}

/**
 * set_searchapi_api_key: Fernet token の ASCII バイト列を bytea へ保存する
 * （Django の `FernetCipher.encrypt()` は base64url 文字列を bytes で返す）。
 * 更新行が無い（= ユーザー不在）なら false。
 */
export async function setSearchApiKey(
  env: Bindings,
  userId: number,
  fernetToken: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(appUser)
      .set({ searchapiApiKeyEncrypted: sql`convert_to(${fernetToken}, 'UTF8')` })
      .where(eq(appUser.id, userId))
      .returning({ id: appUser.id });
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
      .update(appUser)
      .set({ searchapiApiKeyEncrypted: null })
      .where(eq(appUser.id, userId))
      .returning({ id: appUser.id });
    return rows.length > 0;
  });
}

/**
 * `/api/auth/me` の契約（Django UserSerializer / CurrentUserOutput）に一致する形。
 * 派生値の計算式は現行 domain（quota entities）と一致させる:
 *   storage_limit_bytes = storage_limit_gb === null ? null : trunc(gb * 1024^3)
 *   processing_limit_seconds = processing_limit_minutes === null ? null : minutes * 60
 */
export type CurrentUser = {
  id: number;
  username: string;
  email: string;
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
        id: appUser.id,
        username: appUser.username,
        email: appUser.email,
        max_video_upload_size_mb: appUser.maxVideoUploadSizeMb,
        used_storage_bytes: appUser.usedStorageBytes,
        storage_limit_gb: appUser.storageLimitGb,
        used_processing_seconds: appUser.usedProcessingSeconds,
        processing_limit_minutes: appUser.processingLimitMinutes,
        used_ai_answers: appUser.usedAiAnswers,
        ai_answers_limit: appUser.aiAnswersLimit,
        is_over_quota: appUser.isOverQuota,
        video_count: sql<number>`(SELECT count(*)::int FROM app_video v WHERE v.user_id = ${appUser.id})`.as(
          "video_count",
        ),
      })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];

    const storageLimitGb =
      r.storage_limit_gb === null ? null : Number(r.storage_limit_gb);
    const processingLimitMinutes =
      r.processing_limit_minutes === null ? null : Number(r.processing_limit_minutes);

    return {
      // pg は bigint を文字列で返すため Number 化（Django は int を返す）
      id: Number(r.id),
      username: r.username,
      email: r.email,
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
 * Django ModelBackend.authenticate 相当。username で厳密一致 → pbkdf2 検証 → is_active。
 * 成功時 user_id、失敗（不在/パスワード不一致/非アクティブ）は null。
 */
export async function authenticateUser(
  env: Bindings,
  username: string,
  password: string,
): Promise<number | null> {
  const row = await withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appUser.id,
        password: appUser.password,
        is_active: appUser.isActive,
      })
      .from(appUser)
      .where(eq(appUser.username, username))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row) {
    // Django #20760: 存在しないユーザーでも一度ハッシュ計算してタイミング差を縮める
    await verifyDjangoPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  // Django: user.check_password(password) and user_can_authenticate(user)
  const ok = await verifyDjangoPassword(password, row.password);
  if (!ok) return null;
  if (!row.is_active) return null; // user_can_authenticate（is_active）
  // pg は bigint を文字列で返す。安全整数外なら JWT に別 user の id が入る事故を防ぐため fail-closed。
  const id = Number(row.id);
  if (!Number.isSafeInteger(id)) return null;
  return id;
}

// タイミング均等化用のダミーハッシュ（実 pbkdf2_sha256・1.2M iters。照合は必ず失敗）。
const DUMMY_PASSWORD_HASH =
  "pbkdf2_sha256$1200000$qWZtltacjK73Spy2uxAFWu$ywnW8qlRCel1qrSubI570/ry17mjRjMVZoZIDcv2sis=";
