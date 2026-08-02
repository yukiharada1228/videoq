import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import type { AppEnv } from "../types/bindings";
import { sha256Hex } from "../utils/crypto";
import { resolveActiveApiKey } from "../repositories/api-key-repository";
import { resolveOAuthAccessToken } from "../repositories/oauth-repository";

/**
 * 認証方式（要件 §8）。各方式は DRF の authenticator と同じ 3 値を返す:
 *   - absent : 資格情報が無い → 次の方式を試す
 *   - invalid: 資格情報はあるが不正 → 401 で打ち切り（present-but-invalid）
 *   - ok     : 認証成功（userId 確定）
 */
export type AuthVia = "apikey" | "bearer" | "cookie" | "oauth";

export type AuthOutcome =
  | { kind: "ok"; userId: number; via: AuthVia; accessLevel?: string }
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

/** keyword 違いの API キー認証を作る（Django の `keyword` クラス属性に対応）。 */
const apiKeyMethodWithKeyword = (keyword: string): AuthMethod => async (c) => {
  const headerKey = c.req.header("X-API-Key")?.trim();
  const authz = parseAuthHeader(c);
  const raw = headerKey || (authz?.keyword === keyword ? authz.value : undefined);

  if (!raw) return { kind: "absent" };
  if (!raw.startsWith("vq_") || raw.length < 12) return { kind: "absent" }; // Django も None 扱い

  const ctx = await resolveActiveApiKey(c.env, await sha256Hex(raw));
  if (!ctx) return { kind: "invalid", message: "Invalid API key" };
  return { kind: "ok", userId: ctx.userId, via: "apikey", accessLevel: ctx.accessLevel };
};

/**
 * API キー（Django APIKeyAuthentication, keyword="ApiKey"）。
 * 提示: `X-API-Key: vq_...` または `Authorization: ApiKey vq_...`。
 */
export const apiKeyMethod = apiKeyMethodWithKeyword("ApiKey");

/**
 * API キー（Django BearerAPIKeyAuthentication, keyword="Bearer"）。
 * OpenAI SDK が送る `Authorization: Bearer vq_...` を受ける。
 * `vq_` 始まりでなければ absent なので、Bearer JWT はそのまま jwtMethod に流れる。
 */
export const bearerApiKeyMethod = apiKeyMethodWithKeyword("Bearer");

/**
 * OAuth2 Bearer（Django MCPOAuth2Authentication / DOT AccessToken）。
 * `Authorization: Bearer <opaque>` を sha256 → `token_checksum` で照合。
 * `vq_` 始まりは API キー側に譲る（absent）。不正トークンも DOT 同様 **absent**
 * （次の authenticator へ。最終的に 401 + WWW-Authenticate）。
 */
export const oauthBearerMethod: AuthMethod = async (c) => {
  const authz = parseAuthHeader(c);
  if (!authz || authz.keyword !== "Bearer" || !authz.value) return { kind: "absent" };
  if (authz.value.startsWith("vq_")) return { kind: "absent" };

  const checksum = await sha256Hex(authz.value);
  const resolved = await resolveOAuthAccessToken(c.env, checksum);
  if (!resolved) return { kind: "absent" };
  return { kind: "ok", userId: resolved.userId, via: "oauth" };
};

/**
 * Cookie / Bearer JWT（Django CookieJWTAuthentication, SimpleJWT HS256）。
 * 提示: `Authorization: Bearer <jwt>` または Cookie `access_token`。
 */
export const jwtMethod: AuthMethod = async (c) => {
  const authz = parseAuthHeader(c);
  const bearer = authz?.keyword === "Bearer" ? authz.value : undefined;
  const token = bearer ?? getCookie(c, "access_token");
  const via: AuthVia = bearer ? "bearer" : "cookie"; // CSRF は cookie 認証時のみ

  if (!token) return { kind: "absent" };

  try {
    const key = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.token_type !== "access" || typeof payload.user_id !== "number") {
      throw new Error("invalid claims");
    }
    return { kind: "ok", userId: payload.user_id, via };
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
        c.set("authVia", r.via);
        if (r.accessLevel) c.set("apiKeyAccessLevel", r.accessLevel);
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

// --- API キースコープ制御（ApiKeyScopePermission 相当）---
// SCOPE: read / write / chat_write。read_only キーは {read, chat_write} のみ許可。
const READ_ONLY_ALLOWED = new Set(["read", "chat_write"]);

/** Django is_scope_allowed_for_access_level と同一。 */
export function isScopeAllowed(accessLevel: string, requiredScope: string): boolean {
  if (accessLevel === "all") return true;
  if (accessLevel === "read_only") return READ_ONLY_ALLOWED.has(requiredScope);
  return false;
}

/**
 * required_scope を強制するミドルウェア。**API キー認証時のみ**適用（JWT/Cookie は素通り、
 * ApiKeyScopePermission と同じ）。requireAuth の後に配置する。
 * 既定 scope は安全メソッド=read / それ以外=write（view.required_scope 相当は引数で上書き）。
 */
export const requireScope = (scope?: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const accessLevel = c.get("apiKeyAccessLevel");
    if (c.get("authVia") === "apikey" && accessLevel) {
      const required =
        scope ??
        (["GET", "HEAD", "OPTIONS"].includes(c.req.method) ? "read" : "write");
      if (!isScopeAllowed(accessLevel, required)) {
        return c.json(
          { detail: "This API key does not have permission for this action." },
          403,
        );
      }
    }
    await next();
  });
