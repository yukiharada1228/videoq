import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "better-auth/oauth2";
import type { AppEnv } from "../types/bindings";
import { toErrorBody } from "../shared/errors";
import { withDb } from "../db/pool";
import { createAuth } from "../lib/auth";

/**
 * Bearer/API key/OAuth の各認証方式は共通の 3 値を返す:
 *   - absent : 資格情報が無い → 次の方式を試す
 *   - invalid: 資格情報はあるが不正 → 401 で打ち切り
 *   - ok     : 認証成功（userId 確定）
 */
export type AuthVia = "apikey" | "bearer" | "oauth";

export type AuthOutcome =
  | { kind: "ok"; userId: string; via: AuthVia; accessLevel?: string }
  | { kind: "absent" }
  | { kind: "invalid"; message: string };

export type AuthMethod = (c: Context<AppEnv>) => Promise<AuthOutcome>;

function parseAuthHeader(
  c: Context<AppEnv>,
): { keyword: string; value: string } | null {
  const header = c.req.header("Authorization");
  if (!header) return null;
  const idx = header.indexOf(" ");
  if (idx < 0) return null;
  return { keyword: header.slice(0, idx), value: header.slice(idx + 1).trim() };
}

/** Better Auth user ids are string UUIDs (text PK). */
function toUserId(raw: unknown): string | null {
  if (typeof raw === "string") {
    const id = raw.trim();
    return id.length > 0 ? id : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    // Legacy numeric ids during transition / old tokens — reject after UUID cutover.
    return null;
  }
  return null;
}

function accessLevelFromMetadata(metadata: unknown): string | undefined {
  if (!metadata) return undefined;
  let obj: Record<string, unknown> | null = null;
  if (typeof metadata === "string") {
    try {
      obj = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  } else if (typeof metadata === "object") {
    obj = metadata as Record<string, unknown>;
  }
  const level = obj?.accessLevel ?? obj?.access_level;
  return typeof level === "string" ? level : undefined;
}

/** Better Auth cookie session. */
export const sessionMethod: AuthMethod = async (c) => {
  // Vitest / local route tests: inject user id without minting a real BA session.
  if (c.env.ENVIRONMENT !== "production") {
    const testUser = c.req.header("X-VideoQ-Test-User-Id");
    if (testUser) {
      const userId = toUserId(testUser);
      if (userId) return { kind: "ok", userId, via: "bearer" };
    }
  }

  return withDb(c.env, async (db) => {
    const auth = createAuth(c.env, db);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return { kind: "absent" };
    const userId = toUserId(session.user.id);
    if (!userId) return { kind: "invalid", message: "Invalid session" };
    if ((session.user as { banned?: boolean | null }).banned) {
      return { kind: "invalid", message: "User is banned" };
    }
    return { kind: "ok", userId, via: "bearer" };
  });
};

const apiKeyMethodWithKeyword = (keyword: string): AuthMethod => async (c) => {
  const headerKey = c.req.header("X-API-Key")?.trim();
  const authz = parseAuthHeader(c);
  const raw =
    headerKey || (authz?.keyword === keyword ? authz.value : undefined);

  if (!raw) return { kind: "absent" };
  if (!raw.startsWith("vq_") || raw.length < 12) return { kind: "absent" };

  // Vitest fakes do not run Better Auth's apikey verifier; allow explicit test injection.
  if (c.env.ENVIRONMENT !== "production") {
    const testUser = c.req.header("X-VideoQ-Test-User-Id");
    if (testUser) {
      const userId = toUserId(testUser);
      const accessLevel =
        c.req.header("X-VideoQ-Test-Access-Level") ?? "all";
      if (userId) return { kind: "ok", userId, via: "apikey", accessLevel };
    }
  }

  return withDb(c.env, async (db) => {
    const auth = createAuth(c.env, db);
    const api = auth.api as {
      verifyApiKey: (args: {
        body: { key: string };
      }) => Promise<{
        valid: boolean;
        key?: { referenceId?: string | number; metadata?: unknown } | null;
      }>;
    };
    try {
      const result = await api.verifyApiKey({ body: { key: raw } });
      if (!result.valid || !result.key) {
        return { kind: "invalid", message: "Invalid API key" };
      }
      const userId = toUserId(result.key.referenceId);
      if (!userId) {
        return { kind: "invalid", message: "Invalid API key" };
      }
      const accessLevel =
        accessLevelFromMetadata(result.key.metadata) ?? "all";
      return { kind: "ok", userId, via: "apikey", accessLevel };
    } catch {
      return { kind: "invalid", message: "Invalid API key" };
    }
  });
};

export const apiKeyMethod = apiKeyMethodWithKeyword("ApiKey");
export const bearerApiKeyMethod = apiKeyMethodWithKeyword("Bearer");

/**
 * OAuth 2 Bearer access token (MCP / third-party clients) via Better Auth
 * oauth-provider / JWT verification.
 */
export const oauthBearerMethod: AuthMethod = async (c) => {
  const authz = parseAuthHeader(c);
  if (!authz || authz.keyword !== "Bearer" || !authz.value) {
    return { kind: "absent" };
  }
  if (authz.value.startsWith("vq_")) return { kind: "absent" };

  if (c.env.ENVIRONMENT !== "production") {
    const testOauth = c.req.header("X-VideoQ-Test-OAuth-User-Id");
    if (testOauth) {
      const userId = toUserId(testOauth);
      if (userId) return { kind: "ok", userId, via: "oauth" };
    }
  }

  return withDb(c.env, async (db) => {
    // Keep auth constructed so JWKS material is available in-process for jwt plugin.
    createAuth(c.env, db);
    try {
      const baseURL = (
        c.env.BETTER_AUTH_URL?.trim() ||
        c.env.OAUTH_ISSUER_URL?.trim() ||
        c.env.FRONTEND_URL?.trim() ||
        new URL(c.req.url).origin
      ).replace(/\/+$/, "");
      const issuer = `${baseURL}/api/auth`;
      const verified = await verifyAccessToken(authz.value, {
        jwksUrl: `${issuer}/jwks`,
        verifyOptions: {
          issuer,
          audience: `${baseURL}/api/mcp`,
        },
      });
      const userId = toUserId(verified.sub);
      if (!userId) return { kind: "absent" };
      return { kind: "ok", userId, via: "oauth" };
    } catch {
      return { kind: "absent" };
    }
  });
};

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
    }
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  });

const READ_ONLY_ALLOWED = new Set(["read", "chat_write"]);

export function isScopeAllowed(
  accessLevel: string,
  requiredScope: string,
): boolean {
  if (accessLevel === "all") return true;
  if (accessLevel === "read_only") return READ_ONLY_ALLOWED.has(requiredScope);
  return false;
}

export const requireScope = (scope?: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const accessLevel = c.var.apiKeyAccessLevel;
    if (c.var.authVia === "apikey" && accessLevel) {
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
