import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/bindings";
import { toErrorBody } from "../shared/errors";
import { sha256Hex } from "../shared/crypto";
import { verifyAccessToken } from "../lib/jwt";
import { isAuthSessionActive } from "../repositories/auth-repository";
import { resolveActiveApiKey } from "../repositories/api-key-repository";
import { resolveOAuthAccessToken } from "../repositories/oauth-repository";

/**
 * Bearer/API key/OAuth の各認証方式は共通の 3 値を返す:
 *   - absent : 資格情報が無い → 次の方式を試す
 *   - invalid: 資格情報はあるが不正 → 401 で打ち切り（present-but-invalid）
 *   - ok     : 認証成功（userId 確定）
 */
export type AuthVia = "apikey" | "bearer" | "oauth";

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

/** 指定した Authorization スキームを受け付ける API キー認証を作る。 */
const apiKeyMethodWithKeyword = (keyword: string): AuthMethod => async (c) => {
  const headerKey = c.req.header("X-API-Key")?.trim();
  const authz = parseAuthHeader(c);
  const raw = headerKey || (authz?.keyword === keyword ? authz.value : undefined);

  if (!raw) return { kind: "absent" };
  if (!raw.startsWith("vq_") || raw.length < 12) return { kind: "absent" };

  const ctx = await resolveActiveApiKey(c.env, await sha256Hex(raw));
  if (!ctx) return { kind: "invalid", message: "Invalid API key" };
  return { kind: "ok", userId: ctx.userId, via: "apikey", accessLevel: ctx.accessLevel };
};

/**
 * VideoQ API キー認証。
 * 提示: `X-API-Key: vq_...` または `Authorization: ApiKey vq_...`。
 */
export const apiKeyMethod = apiKeyMethodWithKeyword("ApiKey");

/**
 * Bearer スキームで受け取る VideoQ API キー認証。
 * OpenAI SDK が送る `Authorization: Bearer vq_...` を受ける。
 * `vq_` 始まりでなければ absent なので、Bearer JWT はそのまま jwtMethod に流れる。
 */
export const bearerApiKeyMethod = apiKeyMethodWithKeyword("Bearer");

/**
 * OAuth 2 Bearer アクセストークン認証。
 * `Authorization: Bearer <opaque>` を sha256 → `token_checksum` で照合。
 * `vq_` 始まりと未解決トークンは absent として次の認証方式へ渡す。
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

/** Application access token from `Authorization: Bearer <jwt>`. */
export const jwtMethod: AuthMethod = async (c) => {
  const authz = parseAuthHeader(c);
  const bearer = authz?.keyword === "Bearer" ? authz.value : undefined;
  if (!bearer || bearer.startsWith("vq_")) return { kind: "absent" };
  const verified = await verifyAccessToken(c.env, bearer);
  if (!verified) return { kind: "invalid", message: "Invalid access token" };
  // Refresh cookie 失効・パスワード変更後も access JWT を TTL 満了前に拒否する。
  const active = await isAuthSessionActive(
    c.env,
    verified.sessionId,
    verified.userId,
  );
  return active
    ? { kind: "ok", userId: verified.userId, via: "bearer" }
    : { kind: "invalid", message: "Invalid access token" };
};

/**
 * 指定した方式を順序どおり試すミドルウェアファクトリ。
 * 失敗時は統一封筒 `{ error: { code, message } }`。
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
        return c.json(toErrorBody("UNAUTHORIZED", r.message), 401);
      }
      // absent → 次の方式へ
    }
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  });

// --- API キースコープ制御 ---
// SCOPE: read / write / chat_write。read_only キーは {read, chat_write} のみ許可。
const READ_ONLY_ALLOWED = new Set(["read", "chat_write"]);

/** API キーのアクセスレベルで要求スコープを許可できるか判定する。 */
export function isScopeAllowed(accessLevel: string, requiredScope: string): boolean {
  if (accessLevel === "all") return true;
  if (accessLevel === "read_only") return READ_ONLY_ALLOWED.has(requiredScope);
  return false;
}

/**
 * required_scope を強制するミドルウェア。API キー認証時のみ適用する。
 * 既定 scope は安全メソッド=read / それ以外=write。引数で個別指定できる。
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
          toErrorBody(
            "FORBIDDEN",
            "This API key does not have permission for this action.",
          ),
          403,
        );
      }
    }
    await next();
  });
