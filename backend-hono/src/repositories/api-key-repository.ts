import { withClient } from "../db/pool";
import type { Bindings } from "../types/bindings";

export type ApiKeyContext = {
  apiKeyId: number;
  userId: number;
  accessLevel: string;
};

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
  return withClient(env, async (client) => {
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
