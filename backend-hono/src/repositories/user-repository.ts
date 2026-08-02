import { withDb } from "../db/pool";
import { verifyDjangoPassword, hashDjangoPassword } from "../lib/password";
import type { Bindings } from "../types/bindings";

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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO app_accountdeletionrequest (user_id, reason, requested_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [userId, reason],
      );
      await client.query(
        `UPDATE app_user
            SET is_active = false,
                deactivated_at = now(),
                username = $2,
                email = $3
          WHERE id = $1`,
        [userId, `deleted__${hex}`, `deleted__${hex}@invalid.local`],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * トークン検証用にユーザーを取得（check_token の hash_value に必要な項目）。
 * last_login は Django の str(replace(microsecond=0, tzinfo=None)) と一致する UTC 表記
 * 'YYYY-MM-DD HH:MM:SS'（None は null）。不在は null。
 */
export async function getUserForToken(
  env: Bindings,
  pk: number,
): Promise<{ id: number; password: string; email: string; lastLogin: string | null } | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, password, email,
              to_char(last_login AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS last_login
         FROM app_user WHERE id = $1`,
      [pk],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      password: r.password as string,
      email: r.email as string,
      lastLogin: (r.last_login ?? null) as string | null,
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, password, email,
              to_char(last_login AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS last_login
         FROM app_user
        WHERE upper(email::text) = upper($1) AND is_active = true
        ORDER BY id
        LIMIT 1`,
      [email],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    const id = Number(r.id);
    if (!Number.isSafeInteger(id)) return null; // uid に別 user の pk を載せない
    return {
      id,
      password: r.password as string,
      email: r.email as string,
      lastLogin: (r.last_login ?? null) as string | null,
    };
  });
}

/** activate_user: 非アクティブなら is_active=true にする。 */
export async function activateUser(env: Bindings, pk: number): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query(
      `UPDATE app_user SET is_active = true WHERE id = $1 AND is_active = false`,
      [pk],
    );
  });
}

/** set_password: make_password でハッシュ化して password を更新。 */
export async function setUserPassword(
  env: Bindings,
  pk: number,
  newPassword: string,
): Promise<void> {
  const hashed = await hashDjangoPassword(newPassword);
  return withDb(env, async (db, client) => {
    await client.query(`UPDATE app_user SET password = $2 WHERE id = $1`, [pk, hashed]);
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, password, email, pending_email,
              to_char(last_login AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS last_login
         FROM app_user WHERE id = $1`,
      [pk],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      password: r.password as string,
      email: r.email as string,
      pendingEmail: (r.pending_email ?? null) as string | null,
      lastLogin: (r.last_login ?? null) as string | null,
    };
  });
}

/** set_pending_email: 確認が済むまで新アドレスを保持する。 */
export async function setPendingEmail(
  env: Bindings,
  pk: number,
  email: string,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query(`UPDATE app_user SET pending_email = $2 WHERE id = $1`, [pk, email]);
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const taken = await client.query(
        `SELECT 1 FROM app_user WHERE upper(email::text) = upper($1) AND id <> $2`,
        [pendingEmail, pk],
      );
      if (taken.rowCount! > 0) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `UPDATE app_user SET email = $2, pending_email = NULL WHERE id = $1`,
        [pk, pendingEmail],
      );
      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
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
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT 1 FROM app_user WHERE lower(email) = lower($1)`,
      [email],
    );
    return r.rowCount! > 0;
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_user
         (password, last_login, is_superuser, username, first_name, last_name,
          is_staff, is_active, date_joined, email, deactivated_at,
          max_video_upload_size_mb, searchapi_api_key_encrypted, ai_answers_limit,
          is_over_quota, processing_limit_minutes, storage_limit_gb, usage_period_start,
          used_ai_answers, used_processing_seconds, used_storage_bytes, pending_email)
       VALUES ($1, NULL, false, $2, '', '', false, false, CURRENT_TIMESTAMP, $3, NULL,
               $4, NULL, 0, false, 0, 0, NULL, 0, 0, 0, NULL)
       RETURNING id`,
      [hashed, username, normalizedEmail, maxMb],
    );
    return { id: Number(rows[0].id), passwordHash: hashed };
  });
}

/** has_searchapi_api_key: 値の中身は見ず NULL かどうかだけ（復号不要）。ユーザー不在は null。 */
export async function getSearchApiKeyStatus(
  env: Bindings,
  userId: number,
): Promise<boolean | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT searchapi_api_key_encrypted IS NOT NULL AS has_api_key
         FROM app_user WHERE id = $1`,
      [userId],
    );
    return rows.length === 0 ? null : (rows[0].has_api_key as boolean);
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
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `UPDATE app_user SET searchapi_api_key_encrypted = convert_to($2, 'UTF8') WHERE id = $1`,
      [userId, fernetToken],
    );
    return r.rowCount! > 0;
  });
}

/** delete_searchapi_api_key: NULL 化。更新行が無ければ false。 */
export async function deleteSearchApiKey(
  env: Bindings,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `UPDATE app_user SET searchapi_api_key_encrypted = NULL WHERE id = $1`,
      [userId],
    );
    return r.rowCount! > 0;
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT u.id, u.username, u.email,
              u.max_video_upload_size_mb,
              u.used_storage_bytes, u.storage_limit_gb,
              u.used_processing_seconds, u.processing_limit_minutes,
              u.used_ai_answers, u.ai_answers_limit, u.is_over_quota,
              (SELECT count(*) FROM app_video v WHERE v.user_id = u.id)::int AS video_count
       FROM app_user u
       WHERE u.id = $1`,
      [userId],
    );
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
  const row = await withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, password, is_active FROM app_user WHERE username = $1`,
      [username],
    );
    return rows[0] ?? null;
  });
  if (!row) {
    // Django #20760: 存在しないユーザーでも一度ハッシュ計算してタイミング差を縮める
    await verifyDjangoPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  // Django: user.check_password(password) and user_can_authenticate(user)
  const ok = await verifyDjangoPassword(password, row.password as string);
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
