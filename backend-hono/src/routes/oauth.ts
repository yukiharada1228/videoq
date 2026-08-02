import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import { requireAuth, jwtMethod } from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import {
  ACCESS_TOKEN_EXPIRE_SECONDS,
  DEFAULT_SCOPES,
  DEVICE_GRANT_TYPE,
  OAUTH_SCOPES,
  REFRESH_TOKEN_EXPIRE_SECONDS,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  issuerFromEnv,
  isValidRedirectUri,
  isValidResourceUri,
  redirectUriHost,
  renderAuthorizeHtml,
  verifyPkce,
} from "../lib/oauth";
import {
  buildOidcClaims,
  ID_TOKEN_EXPIRE_SECONDS,
  isOidcEnabled,
  signIdToken,
} from "../lib/oidc";
import {
  createAuthorizationGrant,
  createDcrApplication,
  exchangeAuthorizationCode,
  findActiveRefreshToken,
  findApplicationByClientId,
  findDeviceGrantByDeviceCode,
  findValidGrant,
  issueTokensForDeviceGrant,
  listAuthorizedTokens,
  redirectUriAllowed,
  resolveRegistrationAccessToken,
  saveIdTokenForAccessToken,
  updateDcrApplication,
  deleteOAuthApplicationCascade,
  revokeAuthorizedToken,
  revokeOAuthToken,
  rotateRefreshToken,
  verifyClientSecret,
  type OAuthApplication,
} from "../repositories/oauth-repository";
import { withDb } from "../db/pool";
import { issueCsrfToken, verifyDjangoCsrfToken } from "../utils/csrf";
import type { AppEnv } from "../types/bindings";

/**
 * OAuth 2.1 Authorization Server + Settings UI トークン管理。
 *
 * Well-known:
 *   GET /.well-known/oauth-authorization-server(+ optional path)
 *   GET /.well-known/oauth-protected-resource(+ /api/mcp)
 *
 * AS:
 *   GET/POST /api/oauth/authorize/
 *   POST     /api/oauth/token/
 *   POST     /api/oauth/register/
 *   GET      /api/oauth/register/:clientId/
 *   POST     /api/oauth/revoke_token/
 *
 * Settings UI:
 *   GET/DELETE /api/oauth/tokens(/:id)/
 */
export const oauthRoutes = new Hono<AppEnv>();

const jwtOnly = requireAuth(jwtMethod);

// ─── well-known ───────────────────────────────────────────────

const corsStar = (c: Context<AppEnv>) => {
  c.header("Access-Control-Allow-Origin", "*");
};

const asMetadata = (c: Context<AppEnv>) => {
  corsStar(c);
  const issuer = issuerFromEnv(c.env, c.req.url);
  return c.json(buildAuthorizationServerMetadata(issuer));
};

const prMetadata = (c: Context<AppEnv>) => {
  corsStar(c);
  const issuer = issuerFromEnv(c.env, c.req.url);
  return c.json(buildProtectedResourceMetadata(issuer));
};

oauthRoutes.get("/.well-known/oauth-authorization-server", asMetadata);
oauthRoutes.get("/.well-known/oauth-authorization-server/", asMetadata);
oauthRoutes.get(
  "/.well-known/oauth-authorization-server/:issuerPath{.+}",
  asMetadata,
);
oauthRoutes.get("/.well-known/oauth-protected-resource", prMetadata);
oauthRoutes.get("/.well-known/oauth-protected-resource/", prMetadata);
oauthRoutes.get(
  "/.well-known/oauth-protected-resource/:resourcePath{.+}",
  prMetadata,
);

// RFC 8414/9728: prefix 版も配信（Django は root と /api/oauth/ 両方に metadata を持つ）。
// django-oauth-toolkit の metadata_urlpatterns がプレフィックス配下にも入るのと同じ。
oauthRoutes.get("/api/oauth/.well-known/oauth-authorization-server", asMetadata);
oauthRoutes.get("/api/oauth/.well-known/oauth-authorization-server/", asMetadata);
oauthRoutes.get(
  "/api/oauth/.well-known/oauth-authorization-server/:issuerPath{.+}",
  asMetadata,
);
oauthRoutes.get("/api/oauth/.well-known/oauth-protected-resource", prMetadata);
oauthRoutes.get("/api/oauth/.well-known/oauth-protected-resource/", prMetadata);
oauthRoutes.get(
  "/api/oauth/.well-known/oauth-protected-resource/:resourcePath{.+}",
  prMetadata,
);

// ─── Settings UI tokens ───────────────────────────────────────

const listTokens = async (c: Context<AppEnv>) => {
  const tokens = await listAuthorizedTokens(c.env, c.get("userId")!);
  return c.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      client_id: t.client_id,
      client_name: t.client_name,
      scope: t.scope,
      issued_at: t.issued_at,
      expires_at: t.expires_at,
    })),
  });
};

const revokeTokenUi = async (c: Context<AppEnv>) => {
  const tokenId = Number(c.req.param("tokenId"));
  const ok = await revokeAuthorizedToken(c.env, c.get("userId")!, tokenId);
  if (!ok) return c.body(null, 404);
  return c.body(null, 204);
};

oauthRoutes.get("/api/oauth/tokens", jwtOnly, listTokens);
oauthRoutes.get("/api/oauth/tokens/", jwtOnly, listTokens);
oauthRoutes.delete(
  "/api/oauth/tokens/:tokenId{[0-9]+}",
  jwtOnly,
  csrfProtect,
  revokeTokenUi,
);
oauthRoutes.delete(
  "/api/oauth/tokens/:tokenId{[0-9]+}/",
  jwtOnly,
  csrfProtect,
  revokeTokenUi,
);

// ─── helpers ──────────────────────────────────────────────────

function oauthError(
  c: Context<AppEnv>,
  status: 400 | 401,
  error: string,
  description?: string,
) {
  const body: Record<string, string> = { error };
  if (description) body.error_description = description;
  if (status === 401) {
    return c.json(body, status, { "WWW-Authenticate": "Bearer" });
  }
  return c.json(body, status);
}

async function cookieUserId(c: Context<AppEnv>): Promise<number | null> {
  const raw = getCookie(c, "access_token");
  if (!raw) return null;
  try {
    const key = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(raw, key, { algorithms: ["HS256"] });
    if (payload.token_type !== "access" || typeof payload.user_id !== "number") {
      return null;
    }
    return payload.user_id;
  } catch {
    return null;
  }
}

function loginRedirect(c: Context<AppEnv>): Response {
  const frontend = (c.env.FRONTEND_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const next = new URL(c.req.url).pathname + new URL(c.req.url).search;
  const url = `${frontend}/login?next=${encodeURIComponent(next)}`;
  return c.redirect(url, 302);
}

function ensureCsrfCookie(c: Context<AppEnv>): string {
  const existing = getCookie(c, "csrftoken");
  const { secret, token } = issueCsrfToken(existing);
  if (!existing || existing !== secret) {
    const secure = c.env.ENVIRONMENT === "production";
    setCookie(c, "csrftoken", secret, {
      maxAge: 31449600,
      path: "/",
      sameSite: secure ? "None" : "Lax",
      secure,
      httpOnly: false,
    });
  }
  return token;
}

function verifyAuthorizeCsrf(
  c: Context<AppEnv>,
  form: Record<string, string>,
): boolean {
  const cookie = getCookie(c, "csrftoken");
  const presented =
    form.csrfmiddlewaretoken || c.req.header("X-CSRFToken") || undefined;
  return verifyDjangoCsrfToken(cookie, presented);
}

function parseResources(raw: string | null | undefined): string[] | { error: string } {
  if (!raw || !raw.trim()) return [];
  const list = raw.trim().split(/\s+/);
  for (const uri of list) {
    if (!isValidResourceUri(uri)) {
      return {
        error: `The resource '${uri}' is not a valid resource indicator: it must be an absolute URI with a scheme and host.`,
      };
    }
  }
  return list;
}

function resolveScopes(requested: string | null | undefined): string {
  const parts = (requested || DEFAULT_SCOPES.join(" "))
    .split(/\s+/)
    .filter(Boolean);
  const allowed = parts.filter((s) => s in OAUTH_SCOPES);
  return (allowed.length ? allowed : [...DEFAULT_SCOPES]).join(" ");
}

function scopesDescriptions(scope: string): string[] {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => OAUTH_SCOPES[s] ?? s);
}

type AuthParams = {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string[];
  nonce: string;
};

function readAuthParams(
  src: Record<string, string | undefined>,
): AuthParams | { error: string; description: string; redirectUri?: string; state?: string } {
  const clientId = (src.client_id || "").trim();
  const redirectUri = (src.redirect_uri || "").trim();
  const responseType = (src.response_type || "").trim();
  const state = src.state || "";
  const codeChallenge = (src.code_challenge || "").trim();
  const codeChallengeMethod = (src.code_challenge_method || "").trim();
  const nonce = src.nonce || "";
  const scope = resolveScopes(src.scope);

  if (!clientId) {
    return { error: "invalid_request", description: "Missing client_id" };
  }
  if (responseType !== "code") {
    return {
      error: "unsupported_response_type",
      description: "Only response_type=code is supported",
      redirectUri: redirectUri || undefined,
      state,
    };
  }
  if (!redirectUri || !isValidRedirectUri(redirectUri)) {
    return {
      error: "invalid_request",
      description: "Invalid redirect_uri",
    };
  }
  if (!codeChallenge) {
    return {
      error: "invalid_request",
      description: "PKCE code_challenge is required",
      redirectUri,
      state,
    };
  }
  if (codeChallengeMethod !== "S256" && codeChallengeMethod !== "plain") {
    return {
      error: "invalid_request",
      description: "Unsupported code_challenge_method",
      redirectUri,
      state,
    };
  }
  const resources = parseResources(src.resource);
  if ("error" in resources) {
    return {
      error: "invalid_target",
      description: resources.error,
      redirectUri,
      state,
    };
  }

  return {
    clientId,
    redirectUri,
    responseType,
    state,
    scope,
    codeChallenge,
    codeChallengeMethod,
    resource: resources,
    nonce,
  };
}

function appendQuery(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, v);
  }
  return u.toString();
}

async function issueCodeAndRedirect(
  c: Context<AppEnv>,
  userId: number,
  app: OAuthApplication,
  p: AuthParams,
): Promise<Response> {
  const code = await createAuthorizationGrant(c.env, {
    userId,
    applicationId: app.id,
    redirectUri: p.redirectUri,
    scope: p.scope,
    codeChallenge: p.codeChallenge,
    codeChallengeMethod: p.codeChallengeMethod,
    resource: p.resource,
    nonce: p.nonce,
  });
  const loc = appendQuery(p.redirectUri, {
    code,
    ...(p.state ? { state: p.state } : {}),
  });
  return c.redirect(loc, 302);
}

// ─── authorize ────────────────────────────────────────────────

const authorizeGet = async (c: Context<AppEnv>) => {
  const q = c.req.query();
  const parsed = readAuthParams(q);
  if ("error" in parsed) {
    if (parsed.redirectUri && isValidRedirectUri(parsed.redirectUri)) {
      // client_id 不明時は redirect しない（オープンリダイレクト防止）
      if (parsed.error !== "invalid_request" || q.client_id) {
        const app = q.client_id
          ? await findApplicationByClientId(c.env, q.client_id)
          : null;
        if (app && redirectUriAllowed(app, parsed.redirectUri)) {
          return c.redirect(
            appendQuery(parsed.redirectUri, {
              error: parsed.error,
              error_description: parsed.description,
              ...(parsed.state ? { state: parsed.state } : {}),
            }),
            302,
          );
        }
      }
    }
    const csrf = ensureCsrfCookie(c);
    return c.html(
      renderAuthorizeHtml({
        applicationName: "",
        redirectUriHost: null,
        scopesDescriptions: [],
        isDcrClient: false,
        csrfToken: csrf,
        hidden: {},
        error: { error: parsed.error, description: parsed.description },
      }),
      400,
    );
  }

  const app = await findApplicationByClientId(c.env, parsed.clientId);
  if (!app) {
    const csrf = ensureCsrfCookie(c);
    return c.html(
      renderAuthorizeHtml({
        applicationName: "",
        redirectUriHost: null,
        scopesDescriptions: [],
        isDcrClient: false,
        csrfToken: csrf,
        hidden: {},
        error: {
          error: "invalid_request",
          description: "Invalid client_id",
        },
      }),
      400,
    );
  }
  if (!redirectUriAllowed(app, parsed.redirectUri)) {
    const csrf = ensureCsrfCookie(c);
    return c.html(
      renderAuthorizeHtml({
        applicationName: app.name || app.client_id,
        redirectUriHost: null,
        scopesDescriptions: [],
        isDcrClient: app.registration_source === "dcr" && app.user_id == null,
        csrfToken: csrf,
        hidden: {},
        error: {
          error: "invalid_request",
          description: "Mismatching redirect URI",
        },
      }),
      400,
    );
  }
  if (app.authorization_grant_type !== "authorization-code") {
    return c.redirect(
      appendQuery(parsed.redirectUri, {
        error: "unauthorized_client",
        error_description: "Client is not authorized for this grant",
        ...(parsed.state ? { state: parsed.state } : {}),
      }),
      302,
    );
  }

  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);

  if (app.skip_authorization) {
    return issueCodeAndRedirect(c, userId, app, parsed);
  }

  const csrf = ensureCsrfCookie(c);
  const displayName = app.name || app.client_id;
  return c.html(
    renderAuthorizeHtml({
      applicationName: displayName,
      redirectUriHost: redirectUriHost(parsed.redirectUri),
      scopesDescriptions: scopesDescriptions(parsed.scope),
      isDcrClient: app.registration_source === "dcr" && app.user_id == null,
      csrfToken: csrf,
      hidden: {
        redirect_uri: parsed.redirectUri,
        scope: parsed.scope,
        client_id: parsed.clientId,
        state: parsed.state,
        response_type: parsed.responseType,
        code_challenge: parsed.codeChallenge,
        code_challenge_method: parsed.codeChallengeMethod,
        nonce: parsed.nonce,
        resource: parsed.resource.join(" "),
      },
    }),
  );
};

const authorizePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);

  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }

  if (!verifyAuthorizeCsrf(c, form)) {
    return c.html(
      renderAuthorizeHtml({
        applicationName: "",
        redirectUriHost: null,
        scopesDescriptions: [],
        isDcrClient: false,
        csrfToken: ensureCsrfCookie(c),
        hidden: {},
        error: {
          error: "invalid_request",
          description: "CSRF verification failed.",
        },
      }),
      403,
    );
  }

  const parsed = readAuthParams(form);
  if ("error" in parsed) {
    const csrf = ensureCsrfCookie(c);
    return c.html(
      renderAuthorizeHtml({
        applicationName: "",
        redirectUriHost: null,
        scopesDescriptions: [],
        isDcrClient: false,
        csrfToken: csrf,
        hidden: {},
        error: { error: parsed.error, description: parsed.description },
      }),
      400,
    );
  }

  const app = await findApplicationByClientId(c.env, parsed.clientId);
  if (!app || !redirectUriAllowed(app, parsed.redirectUri)) {
    const csrf = ensureCsrfCookie(c);
    return c.html(
      renderAuthorizeHtml({
        applicationName: "",
        redirectUriHost: null,
        scopesDescriptions: [],
        isDcrClient: false,
        csrfToken: csrf,
        hidden: {},
        error: {
          error: "invalid_request",
          description: "Invalid client or redirect_uri",
        },
      }),
      400,
    );
  }

  const allow = form.allow === "True" || form.allow === "true";
  if (!allow) {
    return c.redirect(
      appendQuery(parsed.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the authorization request",
        ...(parsed.state ? { state: parsed.state } : {}),
      }),
      302,
    );
  }

  return issueCodeAndRedirect(c, userId, app, parsed);
};

oauthRoutes.get("/api/oauth/authorize", authorizeGet);
oauthRoutes.get("/api/oauth/authorize/", authorizeGet);
oauthRoutes.post("/api/oauth/authorize", authorizePost);
oauthRoutes.post("/api/oauth/authorize/", authorizePost);

// ─── token ────────────────────────────────────────────────────

/** openid scope + 署名可能な algorithm のとき id_token を発行。 */
async function maybeIssueIdToken(
  c: Context<AppEnv>,
  params: {
    app: OAuthApplication;
    userId: number;
    scope: string;
    accessToken: string;
    nonce?: string;
  },
): Promise<string | null> {
  if (!isOidcEnabled(c.env)) return null;
  const scopes = new Set(params.scope.split(/\s+/).filter(Boolean));
  if (!scopes.has("openid")) return null;
  const alg = params.app.algorithm;
  if (alg !== "RS256" && alg !== "HS256") return null;
  if (alg === "HS256" && params.app.hash_client_secret) return null;

  const user = await withDb(c.env, async (_db, client) => {
    const { rows } = await client.query(
      `SELECT username, email FROM app_user WHERE id = $1`,
      [params.userId],
    );
    return rows[0] as { username: string; email: string } | undefined;
  });
  const jti = crypto.randomUUID();
  const claims = buildOidcClaims({
    userId: params.userId,
    username: user?.username ?? null,
    email: user?.email ?? null,
    scope: params.scope,
  });
  claims.jti = jti;
  const idToken = await signIdToken({
    env: c.env,
    algorithm: alg,
    clientId: params.app.client_id,
    clientSecretPlain:
      alg === "HS256" ? params.app.client_secret : undefined,
    claims,
    nonce: params.nonce || undefined,
  });
  await saveIdTokenForAccessToken(c.env, {
    jti,
    userId: params.userId,
    applicationId: params.app.id,
    scope: params.scope,
    accessTokenValue: params.accessToken,
    expiresInSeconds: ID_TOKEN_EXPIRE_SECONDS,
  });
  return idToken;
}

async function authenticateClient(
  c: Context<AppEnv>,
  form: Record<string, string>,
): Promise<
  | { ok: true; app: OAuthApplication }
  | { ok: false; status: 400 | 401; error: string; description: string }
> {
  let clientId = (form.client_id || "").trim();
  let clientSecret = form.client_secret ?? "";

  const authz = c.req.header("Authorization");
  if (authz?.startsWith("Basic ")) {
    try {
      const decoded = atob(authz.slice(6));
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        clientSecret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch {
      return {
        ok: false,
        status: 401,
        error: "invalid_client",
        description: "Invalid client authentication",
      };
    }
  }

  if (!clientId) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client",
      description: "Missing client_id",
    };
  }

  const app = await findApplicationByClientId(c.env, clientId);
  if (!app) {
    return {
      ok: false,
      status: 401,
      error: "invalid_client",
      description: "Invalid client",
    };
  }

  if (app.client_type === "confidential") {
    const ok = await verifyClientSecret(app, clientSecret);
    if (!ok) {
      return {
        ok: false,
        status: 401,
        error: "invalid_client",
        description: "Invalid client credentials",
      };
    }
  }

  return { ok: true, app };
}

const tokenPost = async (c: Context<AppEnv>) => {
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }

  const auth = await authenticateClient(c, form);
  if (!auth.ok) {
    return oauthError(c, auth.status, auth.error, auth.description);
  }
  const { app } = auth;
  const grantType = (form.grant_type || "").trim();

  if (grantType === "authorization_code") {
    const code = (form.code || "").trim();
    const redirectUri = (form.redirect_uri || "").trim();
    const verifier = (form.code_verifier || "").trim();
    if (!code || !redirectUri || !verifier) {
      return oauthError(
        c,
        400,
        "invalid_request",
        "code, redirect_uri, and code_verifier are required",
      );
    }

    const grant = await findValidGrant(c.env, code, app.id);
    if (!grant) {
      return oauthError(c, 400, "invalid_grant", "Invalid or expired code");
    }
    if (grant.redirect_uri !== redirectUri) {
      return oauthError(c, 400, "invalid_grant", "redirect_uri mismatch");
    }
    const pkceOk = await verifyPkce(
      verifier,
      grant.code_challenge,
      grant.code_challenge_method || "S256",
    );
    if (!pkceOk) {
      return oauthError(c, 400, "invalid_grant", "PKCE verification failed");
    }

    const issued = await exchangeAuthorizationCode(c.env, grant, app.id);
    const body: Record<string, unknown> = {
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: issued.expiresIn,
      refresh_token: issued.refreshToken,
      scope: issued.scope,
    };
    const idToken = await maybeIssueIdToken(c, {
      app,
      userId: grant.user_id,
      scope: issued.scope,
      accessToken: issued.accessToken,
      nonce: grant.nonce,
    });
    if (idToken) body.id_token = idToken;
    return c.json(body);
  }

  if (grantType === "refresh_token") {
    const refresh = (form.refresh_token || "").trim();
    if (!refresh) {
      return oauthError(c, 400, "invalid_request", "refresh_token is required");
    }
    const row = await findActiveRefreshToken(c.env, refresh, app.id);
    if (!row) {
      return oauthError(c, 400, "invalid_grant", "Invalid refresh token");
    }
    const ageSec = (Date.now() - row.created.getTime()) / 1000;
    if (ageSec > REFRESH_TOKEN_EXPIRE_SECONDS) {
      return oauthError(c, 400, "invalid_grant", "Refresh token expired");
    }
    const issued = await rotateRefreshToken(c.env, row);
    return c.json({
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: issued.expiresIn ?? ACCESS_TOKEN_EXPIRE_SECONDS,
      refresh_token: issued.refreshToken,
      scope: issued.scope,
    });
  }

  // RFC 8628 device_code（DOT TokenView.device_flow_token_response 相当）
  if (grantType === DEVICE_GRANT_TYPE) {
    if (app.authorization_grant_type !== DEVICE_GRANT_TYPE) {
      return oauthError(
        c,
        400,
        "unauthorized_client",
        "Application is not authorized for device_code grant",
      );
    }
    const deviceCode = (form.device_code || "").trim();
    if (!deviceCode) {
      return oauthError(c, 400, "invalid_request", "device_code is required");
    }
    const grant = await findDeviceGrantByDeviceCode(
      c.env,
      deviceCode,
      app.client_id,
    );
    if (!grant) {
      return c.json({ error: "device_not_found" }, 404);
    }
    if (grant.status === "authorization-pending") {
      return c.json({ error: "authorization_pending" }, 400);
    }
    if (grant.status === "denied") {
      return c.json({ error: "access_denied" }, 400);
    }
    if (grant.status === "expired") {
      return c.json({ error: "expired_token" }, 400);
    }
    if (grant.status !== "authorized") {
      return c.json({ error: "internal_error" }, 500);
    }
    const issued = await issueTokensForDeviceGrant(c.env, grant, app.id);
    return c.json({
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: issued.expiresIn,
      refresh_token: issued.refreshToken,
      scope: issued.scope,
    });
  }

  return oauthError(
    c,
    400,
    "unsupported_grant_type",
    "Only authorization_code, refresh_token, and device_code are supported",
  );
};

oauthRoutes.post("/api/oauth/token", tokenPost);
oauthRoutes.post("/api/oauth/token/", tokenPost);

// ─── DCR ──────────────────────────────────────────────────────

const GRANT_TYPE_MAP: Record<string, string> = {
  authorization_code: "authorization-code",
  implicit: "implicit",
  password: "password",
  client_credentials: "client-credentials",
  "urn:ietf:params:oauth:grant-type:device_code":
    "urn:ietf:params:oauth:grant-type:device_code",
};

function dcrError(
  c: Context<AppEnv>,
  status: 400 | 401,
  error: string,
  description: string,
) {
  const headers: Record<string, string> = {};
  if (status === 401) {
    headers["WWW-Authenticate"] =
      error === "invalid_token"
        ? `Bearer error="invalid_token", error_description="${description}"`
        : "Bearer";
  }
  return c.json({ error, error_description: description }, status, headers);
}

function buildDcrResponse(
  c: Context<AppEnv>,
  app: OAuthApplication,
  registrationAccessToken: string,
  clientSecretPlain: string | null,
) {
  const issuer = issuerFromEnv(c.env, c.req.url);
  const grantTypes =
    app.authorization_grant_type === "authorization-code"
      ? ["authorization_code", "refresh_token"]
      : [
          Object.entries(GRANT_TYPE_MAP).find(
            ([, v]) => v === app.authorization_grant_type,
          )?.[0] ?? app.authorization_grant_type,
        ];

  const data: Record<string, unknown> = {
    client_id: app.client_id,
    redirect_uris: app.redirect_uris.split(/\s+/).filter(Boolean),
    grant_types: grantTypes,
    token_endpoint_auth_method:
      app.client_type === "public" ? "none" : "client_secret_basic",
    registration_access_token: registrationAccessToken,
    registration_client_uri: `${issuer}/api/oauth/register/${app.client_id}/`,
  };
  if (app.name) data.client_name = app.name;
  if (clientSecretPlain) data.client_secret = clientSecretPlain;
  return data;
}

type DcrMetadata = {
  name: string;
  redirectUris: string[];
  clientType: "public" | "confidential";
  authorizationGrantType: string;
};

/**
 * RFC 7591/7592 のクライアントメタデータを検証（POST 登録 / PUT 更新で共通）。
 * エラー時は dcrError の Response を返す。成功時は正規化した DcrMetadata。
 */
async function parseDcrMetadata(
  c: Context<AppEnv>,
): Promise<Response | DcrMetadata> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    return dcrError(c, 400, "invalid_client_metadata", "Request body must be valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return dcrError(c, 400, "invalid_client_metadata", "Request body must be a JSON object");
  }
  const body = data as Record<string, unknown>;

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris)) {
    return dcrError(c, 400, "invalid_client_metadata", "redirect_uris must be an array");
  }
  if (redirectUris.length === 0) {
    return dcrError(c, 400, "invalid_client_metadata", "redirect_uris is required for grant type 'authorization_code'");
  }
  if (!redirectUris.every((u) => typeof u === "string")) {
    return dcrError(c, 400, "invalid_client_metadata", "Each redirect_uri must be a string");
  }
  for (const uri of redirectUris as string[]) {
    if (!isValidRedirectUri(uri)) {
      return dcrError(c, 400, "invalid_client_metadata", `redirect_uris: Enter a valid URL. (${uri})`);
    }
  }

  const grantTypes = (body.grant_types as unknown) ?? ["authorization_code"];
  if (!Array.isArray(grantTypes) || !grantTypes.every((g) => typeof g === "string")) {
    return dcrError(c, 400, "invalid_client_metadata", "grant_types must be an array");
  }
  const meaningful = (grantTypes as string[]).filter((g) => g !== "refresh_token");
  if (meaningful.length === 0) {
    return dcrError(c, 400, "invalid_client_metadata", "grant_types must contain at least one grant type other than refresh_token");
  }
  if (meaningful.length > 1) {
    return dcrError(c, 400, "invalid_client_metadata", "DOT only supports one grant type per application; multiple non-refresh_token grant types are not supported");
  }
  const dotGrant = GRANT_TYPE_MAP[meaningful[0]];
  if (!dotGrant) {
    return dcrError(c, 400, "invalid_client_metadata", `Unsupported grant_type: '${meaningful[0]}'`);
  }

  const authMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "client_secret_basic";
  if (
    authMethod !== "none" &&
    authMethod !== "client_secret_basic" &&
    authMethod !== "client_secret_post"
  ) {
    return dcrError(c, 400, "invalid_client_metadata", `Unsupported token_endpoint_auth_method: '${authMethod}'`);
  }
  return {
    name: typeof body.client_name === "string" ? body.client_name : "",
    redirectUris: redirectUris as string[],
    clientType: authMethod === "none" ? "public" : "confidential",
    authorizationGrantType: dotGrant,
  };
}

const registerPost = async (c: Context<AppEnv>) => {
  const parsed = await parseDcrMetadata(c);
  if (parsed instanceof Response) return parsed;

  const created = await createDcrApplication(c.env, parsed);
  return c.json(
    buildDcrResponse(
      c,
      created.application,
      created.registrationAccessToken,
      created.clientSecretPlain,
    ),
    201,
  );
};

const registerGet = async (c: Context<AppEnv>) => {
  const clientId = c.req.param("clientId") ?? "";
  const authz = c.req.header("Authorization");
  const raw =
    authz?.startsWith("Bearer ") ? authz.slice(7).trim() : undefined;
  if (!raw) {
    return dcrError(
      c,
      401,
      "invalid_token",
      "Registration access token required",
    );
  }
  const resolved = await resolveRegistrationAccessToken(
    c.env,
    raw,
    clientId,
  );
  if (!resolved) {
    return dcrError(
      c,
      401,
      "invalid_token",
      "Invalid registration access token",
    );
  }
  return c.json(
    buildDcrResponse(c, resolved.application, resolved.token, null),
  );
};

// registration_access_token（Bearer）を解決。失敗時は dcrError Response。
async function resolveRegManagement(
  c: Context<AppEnv>,
): Promise<Response | { application: import("../repositories/oauth-repository").OAuthApplication; rawToken: string }> {
  const clientId = c.req.param("clientId") ?? "";
  const authz = c.req.header("Authorization");
  const raw = authz?.startsWith("Bearer ") ? authz.slice(7).trim() : undefined;
  if (!raw) return dcrError(c, 401, "invalid_token", "Registration access token required");
  const resolved = await resolveRegistrationAccessToken(c.env, raw, clientId);
  if (!resolved) return dcrError(c, 401, "invalid_token", "Invalid registration access token");
  return { application: resolved.application, rawToken: raw };
}

// PUT /api/oauth/register/:clientId ── DCR クライアント更新（RFC 7592）+ トークン rotation
const registerPut = async (c: Context<AppEnv>) => {
  const auth = await resolveRegManagement(c);
  if (auth instanceof Response) return auth;
  const parsed = await parseDcrMetadata(c);
  if (parsed instanceof Response) return parsed;

  const newRegToken = await updateDcrApplication(
    c.env,
    auth.application.id,
    parsed,
    auth.rawToken,
  );
  const updatedApp = {
    ...auth.application,
    name: parsed.name,
    redirect_uris: parsed.redirectUris.join(" "),
    client_type: parsed.clientType,
    authorization_grant_type: parsed.authorizationGrantType,
  };
  return c.json(buildDcrResponse(c, updatedApp, newRegToken, null));
};

// DELETE /api/oauth/register/:clientId ── DCR クライアント削除（RFC 7592）→ 204
const registerDelete = async (c: Context<AppEnv>) => {
  const auth = await resolveRegManagement(c);
  if (auth instanceof Response) return auth;
  await deleteOAuthApplicationCascade(c.env, auth.application.id);
  return c.body(null, 204);
};

oauthRoutes.post("/api/oauth/register", registerPost);
oauthRoutes.post("/api/oauth/register/", registerPost);
oauthRoutes.get("/api/oauth/register/:clientId", registerGet);
oauthRoutes.get("/api/oauth/register/:clientId/", registerGet);
oauthRoutes.put("/api/oauth/register/:clientId", registerPut);
oauthRoutes.put("/api/oauth/register/:clientId/", registerPut);
oauthRoutes.delete("/api/oauth/register/:clientId", registerDelete);
oauthRoutes.delete("/api/oauth/register/:clientId/", registerDelete);

// ─── revoke ───────────────────────────────────────────────────

const revokePost = async (c: Context<AppEnv>) => {
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }

  const auth = await authenticateClient(c, form);
  // RFC 7009: invalid token → still 200; invalid client → 401
  if (!auth.ok) {
    if (auth.error === "invalid_client") {
      return oauthError(c, auth.status, auth.error, auth.description);
    }
    return c.body(null, 200);
  }

  const token = (form.token || "").trim();
  if (!token) return c.body(null, 200);
  const hint = (form.token_type_hint || "").trim() || null;
  await revokeOAuthToken(c.env, token, hint, auth.app.id);
  return c.body(null, 200);
};

oauthRoutes.post("/api/oauth/revoke_token", revokePost);
oauthRoutes.post("/api/oauth/revoke_token/", revokePost);
