import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  type DpopReplayStore,
  enforceDpopBinding,
  parseAccessTokenAuthorization,
  requestToResourceInput,
  verifyJwsAccessToken,
} from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/bindings";
import { toErrorBody } from "../shared/errors";
import { type Db, withDb } from "../db/pool";
import * as schema from "../db/schema";
import {
  authBaseURL,
  createAuth,
  oauthResourceAudience,
} from "../lib/auth";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "../lib/mcp-auth";
import { rateLimitBackend } from "../lib/rate-limit";
import { OAUTH_GRANT_CLAIM } from "../lib/auth-security";
import { isOAuthGrantActive } from "../repositories/oauth-grant-repository";

/**
 * Cookie session/API key/OAuth の各認証方式は共通の結果型を返す:
 *   - absent : 資格情報が無い → 次の方式を試す
 *   - invalid: 資格情報はあるが不正 → 401 で打ち切り
 *   - ok     : 認証成功（userId 確定）
 */
export type AuthVia = "apikey" | "session" | "oauth";

export type AuthOutcome =
  | { kind: "ok"; userId: string; via: AuthVia; accessLevel?: string }
  | { kind: "absent" }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string; requiredScope: string };

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

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * テスト用の認証ヘッダ（`X-VideoQ-Test-*`）を受け付けてよいか。
 *
 * `ENVIRONMENT` だけを条件にすると、`--env production` を付け忘れて deploy した
 * Worker が「誰にでもなりすませる公開エンドポイント」になる。実際に本番の
 * Hyperdrive を共有しているので、ホスト名がローカルであることも必須にする。
 */
function allowsTestAuthHeaders(c: Context<AppEnv>): boolean {
  if (c.env.ENVIRONMENT === "production") return false;
  return LOCAL_HOSTNAMES.has(new URL(c.req.url).hostname);
}

/**
 * 停止・無効化されたアカウントを、セッション以外の資格情報からも締め出す。
 * API key と OAuth access token は資格情報自体の検証しかしないため、
 * ここを通さないと ban してもキーが生き続ける。
 */
async function isUserDisabled(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ banned: schema.users.banned, isActive: schema.users.isActive })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (rows.length === 0) return true;
  return Boolean(rows[0].banned) || !rows[0].isActive;
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
  if (allowsTestAuthHeaders(c)) {
    const testUser = c.req.header("X-VideoQ-Test-User-Id");
    if (testUser) {
      const userId = toUserId(testUser);
      if (userId) return { kind: "ok", userId, via: "session" };
    }
  }

  return withDb(c.env, async (db) => {
    const auth = createAuth(c.env, db);
    // Authorization decisions must observe session revocation and account changes
    // immediately. Better Auth's signed cookie cache is suitable for display-only
    // session reads, but would otherwise keep a revoked session usable until expiry.
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
      query: { disableCookieCache: true },
    });
    if (!session?.user) return { kind: "absent" };
    const userId = toUserId(session.user.id);
    if (!userId) return { kind: "invalid", message: "Invalid session" };
    if ((session.user as { banned?: boolean | null }).banned) {
      return { kind: "invalid", message: "User is banned" };
    }
    if ((session.user as { isActive?: boolean | null }).isActive === false) {
      return { kind: "invalid", message: "User is inactive" };
    }
    return { kind: "ok", userId, via: "session" };
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
  if (allowsTestAuthHeaders(c)) {
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
      if (await isUserDisabled(db, userId)) {
        return { kind: "invalid", message: "User is banned" };
      }
      // Missing/corrupt legacy metadata must not silently become a write key.
      const accessLevel =
        accessLevelFromMetadata(result.key.metadata) ?? "read_only";
      return { kind: "ok", userId, via: "apikey", accessLevel };
    } catch {
      return { kind: "invalid", message: "Invalid API key" };
    }
  });
};

export const apiKeyMethod = apiKeyMethodWithKeyword("ApiKey");
export const bearerApiKeyMethod = apiKeyMethodWithKeyword("Bearer");

const OAUTH_SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/;

/** Parse the RFC 6749 space-delimited scope claim without accepting malformed JWTs. */
function oauthScopes(scope: unknown): Set<string> | null {
  if (scope === undefined) return new Set();
  if (typeof scope !== "string" || scope.length === 0) return null;
  const values = scope.split(" ");
  if (values.some((value) => !OAUTH_SCOPE_TOKEN_PATTERN.test(value))) {
    return null;
  }
  return new Set(values);
}

/** DPoP proof jti reservations must survive isolate changes and concurrent requests. */
function dpopReplayStore(c: Context<AppEnv>): DpopReplayStore {
  const backend = rateLimitBackend(c.env);
  return {
    async reserve({ key, expiresAt, now }) {
      const ttlSec = Math.max(
        1,
        Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
      );
      const result = await backend.consume(`dpop_${key}`, 1, ttlSec);
      return result.allowed;
    },
  };
}

/**
 * OAuth 2 Bearer access token (MCP / third-party clients) via Better Auth
 * oauth-provider / JWT verification.
 */
export const oauthBearerMethod: AuthMethod = async (c) => {
  const authz = parseAuthHeader(c);
  if (
    !authz ||
    (authz.keyword !== "Bearer" && authz.keyword !== "DPoP") ||
    !authz.value
  ) {
    return { kind: "absent" };
  }
  if (authz.value.startsWith("vq_")) return { kind: "absent" };

  if (allowsTestAuthHeaders(c)) {
    const testOauth = c.req.header("X-VideoQ-Test-OAuth-User-Id");
    if (testOauth) {
      const userId = toUserId(testOauth);
      if (userId) {
        const scopes = new Set(
          (c.req.header("X-VideoQ-Test-OAuth-Scopes") ??
            `${MCP_READ_SCOPE} ${MCP_WRITE_SCOPE}`)
            .split(/\s+/)
            .filter(Boolean),
        );
        if (!scopes.has(MCP_READ_SCOPE)) {
          return {
            kind: "forbidden",
            message: "OAuth token lacks videoq.read scope",
            requiredScope: MCP_READ_SCOPE,
          };
        }
        return {
          kind: "ok",
          userId,
          via: "oauth",
          accessLevel: scopes.has(MCP_WRITE_SCOPE) ? "all" : "read_only",
        };
      }
    }
  }

  const resourceRequest = requestToResourceInput(c.req.raw);
  const authorization = parseAccessTokenAuthorization(
    resourceRequest.authorizationHeader,
  );
  if (!authorization?.token || authorization.scheme === "Unknown") {
    return { kind: "invalid", message: "Invalid OAuth access token" };
  }

  return withDb(c.env, async (db) => {
    const auth = createAuth(c.env, db);
    try {
      const baseURL = authBaseURL(c.env);
      const issuer = `${baseURL}/api/auth`;
      // Read Better Auth's JWKS through its in-process server API. A public
      // fetch to `${issuer}/jwks` cannot target a same-zone Cloudflare Route.
      const verified = await verifyJwsAccessToken(authorization.token, {
        jwksFetch: () => auth.api.getJwks(),
        // Bind the five-minute Better Auth JWKS cache to this Worker env. The
        // cached value is plain key material and contains no request-scoped I/O.
        jwksCacheKey: c.env,
        verifyOptions: {
          issuer,
          audience: oauthResourceAudience(c.env),
        },
      });
      await enforceDpopBinding({
        payload: verified,
        authorization,
        proofJwt: resourceRequest.dpopProofJwt,
        method: resourceRequest.method,
        url: resourceRequest.url,
        replayStore: dpopReplayStore(c),
      });
      const userId = toUserId(verified.sub);
      if (!userId) {
        return { kind: "invalid", message: "Invalid OAuth access token" };
      }
      if (await isUserDisabled(db, userId)) {
        return { kind: "invalid", message: "User is banned" };
      }
      const scopes = oauthScopes(verified.scope);
      if (!scopes) {
        return { kind: "invalid", message: "Invalid OAuth access token" };
      }
      const grantId = verified[OAUTH_GRANT_CLAIM];
      const clientId = verified.client_id;
      if (
        typeof grantId !== "string" || !grantId ||
        typeof clientId !== "string" || !clientId ||
        !(await isOAuthGrantActive(db, userId, clientId, grantId, scopes))
      ) {
        return { kind: "invalid", message: "OAuth authorization has been revoked" };
      }
      if (!scopes.has(MCP_READ_SCOPE)) {
        return {
          kind: "forbidden",
          message: "OAuth token lacks videoq.read scope",
          requiredScope: MCP_READ_SCOPE,
        };
      }
      return {
        kind: "ok",
        userId,
        via: "oauth",
        accessLevel: scopes.has(MCP_WRITE_SCOPE) ? "all" : "read_only",
      };
    } catch {
      return { kind: "invalid", message: "Invalid OAuth access token" };
    }
  });
};

export const requireAuth = (...methods: AuthMethod[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const result = await resolveAuth(c, methods);
    if (result.kind === "ok") {
      return next();
    }
    if (result.kind === "invalid") {
      return c.json(toErrorBody("UNAUTHORIZED", result.message), 401);
    }
    if (result.kind === "forbidden") {
      return c.json(toErrorBody("FORBIDDEN", result.message), 403);
    }
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  });

/** Authenticate once and populate Hono variables for either HTTP or tRPC handlers. */
export async function resolveAuth(
  c: Context<AppEnv>,
  methods: readonly AuthMethod[],
): Promise<AuthOutcome> {
  for (const method of methods) {
    const result = await method(c);
    if (result.kind === "ok") {
      c.set("userId", result.userId);
      c.set("authVia", result.via);
      if (result.accessLevel) {
        c.set("apiKeyAccessLevel", result.accessLevel);
      }
      return result;
    }
    if (result.kind === "invalid" || result.kind === "forbidden") {
      return result;
    }
  }
  return { kind: "absent" };
}

export function isScopeAllowed(
  accessLevel: string,
  requiredScope: string,
): boolean {
  if (accessLevel === "all") return true;
  if (accessLevel === "read_only") return requiredScope === "read";
  return false;
}

export const requireScope = (scope?: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const accessLevel = c.var.apiKeyAccessLevel;
    if (c.var.authVia === "apikey") {
      const required =
        scope ??
        (["GET", "HEAD", "OPTIONS"].includes(c.req.method) ? "read" : "write");
      if (!isScopeAllowed(accessLevel ?? "", required)) {
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
