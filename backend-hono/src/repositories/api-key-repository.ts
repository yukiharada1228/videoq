import { withDb } from "../db/pool";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import { sha256Hex } from "../utils/crypto";
import type { Bindings } from "../types/bindings";

export type ApiKeyContext = {
  apiKeyId: number;
  userId: number;
  accessLevel: string;
};

// ApiKeySerializer に一致する形（生キーは含めない）。
export type ApiKeyItem = {
  id: number;
  name: string;
  access_level: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

/** raw key 生成（UserApiKey.generate_raw_key: `vq_` + token_urlsafe(32)）。 */
function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64url = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `vq_${b64url}`;
}

/** 現在ユーザーのアクティブな API キー一覧（-created_at,-id 順）。 */
export async function listApiKeys(
  env: Bindings,
  userId: number,
): Promise<ApiKeyItem[]> {
  return withDb(env, async (db, client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);
    const { rows } = await client.query(
      `SELECT id, name, access_level, prefix,
              to_char(last_used_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS last_used_at,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at
         FROM app_userapikey
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC, id DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      access_level: r.access_level,
      prefix: r.prefix,
      last_used_at: r.last_used_at ? normalizeDrfDatetime(r.last_used_at) : null,
      created_at: normalizeDrfDatetime(r.created_at),
    }));
  });
}

/** 同名のアクティブキーが既に存在するか（exists_active_with_name 相当）。 */
export async function existsActiveApiKeyName(
  env: Bindings,
  userId: number,
  name: string,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT 1 FROM app_userapikey
        WHERE user_id = $1 AND name = $2 AND revoked_at IS NULL`,
      [userId, name],
    );
    return r.rowCount! > 0;
  });
}

/**
 * API キー作成（create_for_user 相当）。raw key を生成し sha256 で保存、prefix=先頭12。
 * 返り値は ApiKeySerializer 相当 + 生キー（raw は一度だけ返す）。
 */
export async function createApiKey(
  env: Bindings,
  userId: number,
  name: string,
  accessLevel: string,
): Promise<{ apiKey: ApiKeyItem; rawKey: string }> {
  const rawKey = generateRawKey();
  const prefix = rawKey.slice(0, 12);
  const hashedKey = await sha256Hex(rawKey);

  const apiKey = await withDb(env, async (db, client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);
    const { rows } = await client.query(
      `INSERT INTO app_userapikey
         (user_id, name, access_level, prefix, hashed_key, last_used_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NULL, CURRENT_TIMESTAMP)
       RETURNING id,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at`,
      [userId, name, accessLevel, prefix, hashedKey],
    );
    const r = rows[0];
    return {
      id: Number(r.id),
      name,
      access_level: accessLevel,
      prefix,
      last_used_at: null,
      created_at: normalizeDrfDatetime(r.created_at),
    } satisfies ApiKeyItem;
  });

  return { apiKey, rawKey };
}

/** API キー失効（revoke 相当）。アクティブなものだけ。成功=true。 */
export async function revokeApiKey(
  env: Bindings,
  keyId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `UPDATE app_userapikey SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [keyId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}

/**
 * API キー（`vq_...`）の照合。Django `DjangoApiKeyResolver.resolve` と同一条件:
 *   hashed_key 一致 AND revoked_at IS NULL AND user.is_active。
 * 一致時は `last_used_at` を更新（Django の mark_used 相当, 要件 AU-4b）。
 *
 * 検索・更新を単一の UPDATE ... RETURNING で原子的に行う（PoC #04 の要領）。
 */
export async function resolveActiveApiKey(
  env: Bindings,
  hashedKey: string,
): Promise<ApiKeyContext | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `UPDATE app_userapikey k
          SET last_used_at = now()
         FROM app_user u
        WHERE k.hashed_key = $1
          AND k.revoked_at IS NULL
          AND u.id = k.user_id
          AND u.is_active = true
      RETURNING k.id AS api_key_id, k.user_id, k.access_level`,
      [hashedKey],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      apiKeyId: Number(r.api_key_id),
      userId: Number(r.user_id),
      accessLevel: r.access_level,
    };
  });
}
