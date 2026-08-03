import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { apiKeys } from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import { sha256Hex } from "../shared/crypto";
import type { Bindings } from "../types/bindings";

export type ApiKeyContext = {
  apiKeyId: number;
  userId: number;
  accessLevel: string;
};

export type ApiKeyItem = {
  id: number;
  name: string;
  access_level: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

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
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        access_level: apiKeys.accessLevel,
        prefix: apiKeys.prefix,
        last_used_at: apiKeys.lastUsedAt,
        created_at: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));

    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      access_level: r.access_level,
      prefix: r.prefix,
      last_used_at: r.last_used_at ? toUtcIso(r.last_used_at) : null,
      created_at: toUtcIso(r.created_at)!,
    }));
  });
}

export async function existsActiveApiKeyName(
  env: Bindings,
  userId: number,
  name: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, userId),
          eq(apiKeys.name, name),
          isNull(apiKeys.revokedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

export async function createApiKey(
  env: Bindings,
  userId: number,
  name: string,
  accessLevel: string,
): Promise<{ apiKey: ApiKeyItem; rawKey: string }> {
  const rawKey = generateRawKey();
  const prefix = rawKey.slice(0, 12);
  const hashedKey = await sha256Hex(rawKey);

  const apiKey = await withDb(env, async (db) => {
    const rows = await db
      .insert(apiKeys)
      .values({
        userId,
        name,
        accessLevel,
        prefix,
        hashedKey,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning({
        id: apiKeys.id,
        created_at: apiKeys.createdAt,
      });
    const r = rows[0];
    return {
      id: Number(r.id),
      name,
      access_level: accessLevel,
      prefix,
      last_used_at: null,
      created_at: toUtcIso(r.created_at)!,
    } satisfies ApiKeyItem;
  });

  return { apiKey, rawKey };
}

export async function revokeApiKey(
  env: Bindings,
  keyId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(apiKeys)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.userId, userId),
          isNull(apiKeys.revokedAt),
        ),
      )
      .returning({ id: apiKeys.id });
    return rows.length > 0;
  });
}

export async function resolveActiveApiKey(
  env: Bindings,
  hashedKey: string,
): Promise<ApiKeyContext | null> {
  return withDb(env, async (db) => {
    // API キーの使用日時更新と所有者解決をアトミックに行う。
    const result = await db.execute(sql`
      UPDATE api_keys k
         SET last_used_at = now()
        FROM users u
       WHERE k.hashed_key = ${hashedKey}
         AND k.revoked_at IS NULL
         AND u.id = k.user_id
         AND u.is_active = true
      RETURNING k.id AS api_key_id, k.user_id, k.access_level
    `);
    const rows = result.rows as Array<{
      api_key_id: number;
      user_id: number;
      access_level: string;
    }>;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      apiKeyId: Number(r.api_key_id),
      userId: Number(r.user_id),
      accessLevel: r.access_level,
    };
  });
}
