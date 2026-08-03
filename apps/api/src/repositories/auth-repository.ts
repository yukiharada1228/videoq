import { withClient } from "../db/pool";
import { sha256Hex } from "../shared/crypto";
import type { Bindings } from "../types/bindings";

export type ActionPurpose =
  | "verify_email"
  | "reset_password"
  | "change_email"
  | "oauth_form";

const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createAuthSession(
  env: Bindings,
  userId: number,
  familyId = crypto.randomUUID(),
): Promise<{ refreshToken: string; sessionId: string; familyId: string }> {
  const refreshToken = randomToken();
  const tokenHash = await sha256Hex(refreshToken);
  const sessionId = crypto.randomUUID();
  await withClient(env, async (client) => {
    await client.query(
      `INSERT INTO auth_sessions
         (id, user_id, family_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 * interval '1 second'))`,
      [sessionId, userId, familyId, tokenHash, REFRESH_TTL_SECONDS],
    );
  });
  return { refreshToken, sessionId, familyId };
}

export async function rotateAuthSession(
  env: Bindings,
  refreshToken: string,
): Promise<
  | { refreshToken: string; sessionId: string; familyId: string; userId: number }
  | null
> {
  const tokenHash = await sha256Hex(refreshToken);
  return withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query<{
        id: string;
        user_id: string | number;
        family_id: string;
        revoked_at: Date | null;
        expires_at: Date;
        is_active: boolean;
      }>(
        `SELECT s.id, s.user_id, s.family_id, s.revoked_at, s.expires_at, u.is_active
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1
          FOR UPDATE`,
        [tokenHash],
      );
      const current = result.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }
      if (
        current.revoked_at ||
        current.expires_at.getTime() <= Date.now() ||
        !current.is_active
      ) {
        await client.query(
          `UPDATE auth_sessions
              SET revoked_at = COALESCE(revoked_at, now())
            WHERE family_id = $1`,
          [current.family_id],
        );
        await client.query("COMMIT");
        return null;
      }

      const nextToken = randomToken();
      const nextHash = await sha256Hex(nextToken);
      const nextId = crypto.randomUUID();
      await client.query(
        `INSERT INTO auth_sessions
           (id, user_id, family_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + ($5 * interval '1 second'))`,
        [nextId, current.user_id, current.family_id, nextHash, REFRESH_TTL_SECONDS],
      );
      await client.query(
        `UPDATE auth_sessions
            SET revoked_at = now(), replaced_by = $2
          WHERE id = $1`,
        [current.id, nextId],
      );
      await client.query("COMMIT");
      return {
        refreshToken: nextToken,
        sessionId: nextId,
        familyId: current.family_id,
        userId: Number(current.user_id),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function revokeAuthSession(
  env: Bindings,
  refreshToken: string | undefined,
): Promise<void> {
  if (!refreshToken) return;
  const tokenHash = await sha256Hex(refreshToken);
  await withClient(env, async (client) => {
    await client.query(
      `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now())
        WHERE token_hash = $1`,
      [tokenHash],
    );
  });
}

export async function resolveAuthSession(
  env: Bindings,
  refreshToken: string | undefined,
): Promise<{ userId: number; sessionId: string } | null> {
  if (!refreshToken) return null;
  const tokenHash = await sha256Hex(refreshToken);
  return withClient(env, async (client) => {
    const result = await client.query<{ user_id: string | number; id: string }>(
      `SELECT s.user_id, s.id
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.is_active = true
        LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? { userId: Number(row.user_id), sessionId: row.id } : null;
  });
}

export async function createActionToken(
  env: Bindings,
  userId: number,
  purpose: ActionPurpose,
  payload: Record<string, unknown> = {},
  ttlSeconds = 24 * 60 * 60,
): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await withClient(env, async (client) => {
    await client.query("BEGIN");
    try {
      if (purpose !== "oauth_form") {
        await client.query(
          `UPDATE auth_action_tokens
              SET consumed_at = COALESCE(consumed_at, now())
            WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
          [userId, purpose],
        );
      }
      await client.query(
        `INSERT INTO auth_action_tokens
           (user_id, purpose, token_hash, payload, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, now() + ($5 * interval '1 second'))`,
        [userId, purpose, tokenHash, JSON.stringify(payload), ttlSeconds],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return token;
}

export async function consumeActionToken(
  env: Bindings,
  token: string,
  purpose: ActionPurpose,
): Promise<{ userId: number; payload: Record<string, unknown> } | null> {
  const tokenHash = await sha256Hex(token);
  return withClient(env, async (client) => {
    const result = await client.query<{
      user_id: string | number;
      payload: Record<string, unknown>;
    }>(
      `UPDATE auth_action_tokens
          SET consumed_at = now()
        WHERE token_hash = $1
          AND purpose = $2
          AND consumed_at IS NULL
          AND expires_at > now()
      RETURNING user_id, payload`,
      [tokenHash, purpose],
    );
    const row = result.rows[0];
    return row
      ? { userId: Number(row.user_id), payload: row.payload ?? {} }
      : null;
  });
}
