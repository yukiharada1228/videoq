import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import type { AppEnv } from "../types/bindings";
import { sha256Hex } from "../utils/crypto";
import { resolveActiveApiKey } from "../repositories/api-key-repository";

/**
 * 認証方式（要件 §8）。各方式は DRF の authenticator と同じ 3 値を返す:
 *   - absent : 資格情報が無い → 次の方式を試す
 *   - invalid: 資格情報はあるが不正 → 401 で打ち切り（present-but-invalid）
 *   - ok     : 認証成功（userId 確定）
 */
export type AuthOutcome =
  | { kind: "ok"; userId: number }
  | { kind: "absent" }
  | { kind: "invalid"; message: string };

export type AuthMethod = (c: Context<AppEnv>) => Promise<AuthOutcome>;

/** Authorization ヘッダを "<keyword> <value>" に分解。 */
function parseAuthHeader(c: Context<AppEnv>): { keyword: string; value: string } | null {
  const header = c.req.header("Authorization");
  if (!header) return null;
  const idx = header.indexOf(" ");
  if (idx < 0) return null;
  return { keyword: header.slice(0, idx), value: header.slice(idx + 1).trim() };
}

/**
 * API キー（Django APIKeyAuthentication, keyword="ApiKey"）。
 * 提示: `X-API-Key: vq_...` または `Authorization: ApiKey vq_...`。
 */
export const apiKeyMethod: AuthMethod = async (c) => {
  const headerKey = c.req.header("X-API-Key")?.trim();
  const authz = parseAuthHeader(c);
  const raw = headerKey || (authz?.keyword === "ApiKey" ? authz.value : undefined);

  if (!raw) return { kind: "absent" };
  if (!raw.startsWith("vq_") || raw.length < 12) return { kind: "absent" }; // Django も None 扱い

  const ctx = await resolveActiveApiKey(c.env, await sha256Hex(raw));
  if (!ctx) return { kind: "invalid", message: "Invalid API key" };
  return { kind: "ok", userId: ctx.userId };
};

/**
 * Cookie / Bearer JWT（Django CookieJWTAuthentication, SimpleJWT HS256）。
 * 提示: `Authorization: Bearer <jwt>` または Cookie `access_token`。
 */
export const jwtMethod: AuthMethod = async (c) => {
  const authz = parseAuthHeader(c);
  const token =
    (authz?.keyword === "Bearer" ? authz.value : undefined) ??
    getCookie(c, "access_token");

  if (!token) return { kind: "absent" };

  try {
    const key = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.token_type !== "access" || typeof payload.user_id !== "number") {
      throw new Error("invalid claims");
    }
    return { kind: "ok", userId: payload.user_id };
  } catch {
    return { kind: "invalid", message: "Given token not valid for any token type" };
  }
};

/**
 * 指定した方式を DRF と同じ順序で試すミドルウェアファクトリ。
 * 例: /api/auth/me は requireAuth(apiKeyMethod, jwtMethod)（MeView の authentication_classes 順）。
 * 失敗時は DRF 互換の 401 `{ detail }`（統一封筒は使わない）。
 */
export const requireAuth = (...methods: AuthMethod[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    for (const method of methods) {
      const r = await method(c);
      if (r.kind === "ok") {
        c.set("userId", r.userId);
        return next();
      }
      if (r.kind === "invalid") {
        return c.json({ detail: r.message }, 401);
      }
      // absent → 次の方式へ
    }
    return c.json(
      { detail: "Authentication credentials were not provided." },
      401,
    );
  });
