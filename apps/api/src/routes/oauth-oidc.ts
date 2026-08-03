import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import {
  buildOidcClaims,
  buildOpenIdConfiguration,
  isOidcEnabled,
  isOidcRpLogoutEnabled,
  isTruthyEnv,
  loadOidcRsaPrivateKey,
  peekIdTokenClaims,
  OIDC_JWKS_MAX_AGE_SECONDS,
} from "../lib/oidc";
import { escapeHtml, issuerFromEnv } from "../lib/oauth";
import {
  findAccessTokenForUserinfo,
  findApplicationByClientId,
  findIdTokenByJti,
  postLogoutRedirectUriAllowed,
  revokeTokensForOidcLogout,
} from "../repositories/oauth-repository";
import { issueCsrfToken, verifyDjangoCsrfToken } from "../utils/csrf";
import type { AppEnv } from "../types/bindings";

/**
 * OpenID Connect endpoints（DOT oidc_urlpatterns）。
 * OIDC_ENABLED でない場合は 404（OIDCOnlyMixin 相当）。
 */
export const oauthOidcRoutes = new Hono<AppEnv>();

function oidcDisabled(c: Context<AppEnv>): Response {
  return c.body(null, 404);
}

function requireOidc(c: Context<AppEnv>): boolean {
  return isOidcEnabled(c.env);
}

async function cookieUserId(c: Context<AppEnv>): Promise<number | null> {
  const token = getCookie(c, "access_token");
  if (!token) return null;
  try {
    const key = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.token_type !== "access" || typeof payload.user_id !== "number") {
      return null;
    }
    return payload.user_id;
  } catch {
    return null;
  }
}

const discovery = async (c: Context<AppEnv>) => {
  if (!requireOidc(c)) return oidcDisabled(c);
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(buildOpenIdConfiguration(c.env, c.req.url));
};

const jwks = async (c: Context<AppEnv>) => {
  if (!requireOidc(c)) return oidcDisabled(c);
  const keys: Record<string, unknown>[] = [];
  const rsa = await loadOidcRsaPrivateKey(c.env);
  if (rsa) {
    keys.push({
      ...rsa.publicJwk,
      alg: "RS256",
      use: "sig",
      kid: rsa.kid,
    });
  }
  c.header("Access-Control-Allow-Origin", "*");
  c.header(
    "Cache-Control",
    `public, max-age=${OIDC_JWKS_MAX_AGE_SECONDS}, stale-while-revalidate=${OIDC_JWKS_MAX_AGE_SECONDS}, stale-if-error=${OIDC_JWKS_MAX_AGE_SECONDS}`,
  );
  return c.json({ keys });
};

const userinfo = async (c: Context<AppEnv>) => {
  if (!requireOidc(c)) return oidcDisabled(c);
  const authz = c.req.header("Authorization") || "";
  let bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!bearer && c.req.method === "POST") {
    const body = await c.req.parseBody();
    if (typeof body.access_token === "string") bearer = body.access_token.trim();
  }
  if (!bearer) {
    return c.json(
      { error: "invalid_token", error_description: "The access token is missing" },
      401,
      { "WWW-Authenticate": "Bearer" },
    );
  }
  const row = await findAccessTokenForUserinfo(c.env, bearer);
  if (!row) {
    return c.json(
      { error: "invalid_token", error_description: "The access token is invalid" },
      401,
      { "WWW-Authenticate": 'Bearer error="invalid_token"' },
    );
  }
  const claims = buildOidcClaims({
    userId: row.userId,
    username: row.username,
    email: row.email,
    scope: row.scope,
  });
  return c.json(claims);
};

function logoutShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Logout — VideoQ</title>
<style>
body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}
button{margin:.5rem .5rem 0 0;padding:.5rem 1rem;font:inherit;cursor:pointer}
.err{color:#b00020}
</style></head><body>${body}</body></html>`;
}

function clearSessionCookies(c: Context<AppEnv>) {
  const secure = c.env.ENVIRONMENT === "production";
  deleteCookie(c, "access_token", { path: "/" });
  deleteCookie(c, "refresh_token", { path: "/" });
  // overwrite empty for clients that ignore Max-Age
  setCookie(c, "access_token", "", {
    path: "/",
    httpOnly: true,
    sameSite: secure ? "None" : "Lax",
    secure,
    maxAge: 0,
  });
  setCookie(c, "refresh_token", "", {
    path: "/",
    httpOnly: true,
    sameSite: secure ? "None" : "Lax",
    secure,
    maxAge: 0,
  });
}

async function doLogout(
  c: Context<AppEnv>,
  opts: {
    userId: number | null;
    postLogoutRedirectUri?: string;
    state?: string;
    applicationAllowedSchemes?: string[];
  },
): Promise<Response> {
  const deleteTokens =
    c.env.OIDC_RP_INITIATED_LOGOUT_DELETE_TOKENS === undefined ||
    isTruthyEnv(c.env.OIDC_RP_INITIATED_LOGOUT_DELETE_TOKENS);
  if (deleteTokens && opts.userId != null) {
    await revokeTokensForOidcLogout(c.env, opts.userId);
  }
  clearSessionCookies(c);

  if (opts.postLogoutRedirectUri) {
    const u = new URL(opts.postLogoutRedirectUri);
    if (opts.state) u.searchParams.set("state", opts.state);
    return c.redirect(u.toString(), 302);
  }
  const issuer = issuerFromEnv(c.env, c.req.url);
  return c.redirect(`${issuer}/`, 302);
}

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function validateLogoutRequest(
  c: Context<AppEnv>,
  idTokenHint: string | undefined,
  clientId: string | undefined,
  postLogoutRedirectUri: string | undefined,
): Promise<
  | { ok: true; tokenUserId: number | null }
  | { ok: false; status: number; error: string }
> {
  let tokenUserId: number | null = null;
  let app = clientId
    ? await findApplicationByClientId(c.env, clientId)
    : null;
  if (clientId && !app) {
    return { ok: false, status: 400, error: "invalid_client" };
  }

  if (idTokenHint) {
    const issuer = issuerFromEnv(c.env, c.req.url);
    const acceptExpired =
      c.env.OIDC_RP_INITIATED_LOGOUT_ACCEPT_EXPIRED_TOKENS === undefined ||
      isTruthyEnv(c.env.OIDC_RP_INITIATED_LOGOUT_ACCEPT_EXPIRED_TOKENS);

    let claims = await peekIdTokenClaims(c.env, idTokenHint, {
      acceptExpired,
      expectedIss: issuer,
    });
    if (!claims) {
      const unsafe = decodeJwtPayloadUnsafe(idTokenHint);
      const aud = typeof unsafe?.aud === "string" ? unsafe.aud : "";
      const audApp = aud ? await findApplicationByClientId(c.env, aud) : null;
      const hsSecret =
        audApp && !audApp.hash_client_secret ? audApp.client_secret : undefined;
      claims = await peekIdTokenClaims(c.env, idTokenHint, {
        acceptExpired,
        expectedIss: issuer,
        hsSecret,
      });
      if (!app && audApp) app = audApp;
    }

    if (!claims || typeof claims.jti !== "string") {
      return { ok: false, status: 400, error: "invalid_id_token" };
    }
    const stored = await findIdTokenByJti(c.env, claims.jti);
    if (!stored) {
      return { ok: false, status: 400, error: "invalid_id_token" };
    }
    tokenUserId = stored.userId;
    if (!app && typeof claims.aud === "string") {
      app = await findApplicationByClientId(c.env, claims.aud);
    }
    if (clientId && app && app.client_id !== clientId) {
      return { ok: false, status: 400, error: "client_id_mismatch" };
    }
  }

  if (postLogoutRedirectUri) {
    if (!app) {
      return { ok: false, status: 400, error: "invalid_client" };
    }
    try {
      const scheme = new URL(postLogoutRedirectUri).protocol.replace(":", "");
      if (!scheme) {
        return { ok: false, status: 400, error: "invalid_redirect_uri" };
      }
    } catch {
      return { ok: false, status: 400, error: "invalid_redirect_uri" };
    }
    if (!postLogoutRedirectUriAllowed(app, postLogoutRedirectUri)) {
      return { ok: false, status: 400, error: "invalid_redirect_uri" };
    }
  }

  return { ok: true, tokenUserId };
}

function mustPrompt(
  c: Context<AppEnv>,
  sessionUserId: number | null,
  tokenUserId: number | null,
): boolean {
  if (sessionUserId == null) return false;
  const always =
    c.env.OIDC_RP_INITIATED_LOGOUT_ALWAYS_PROMPT === undefined ||
    isTruthyEnv(c.env.OIDC_RP_INITIATED_LOGOUT_ALWAYS_PROMPT);
  if (always) return true;
  if (tokenUserId == null) return true;
  if (tokenUserId !== sessionUserId) return true;
  return false;
}

const logoutGet = async (c: Context<AppEnv>) => {
  if (!isOidcRpLogoutEnabled(c.env)) return oidcDisabled(c);
  const idTokenHint = c.req.query("id_token_hint") || undefined;
  const clientId = c.req.query("client_id") || undefined;
  const postLogoutRedirectUri =
    c.req.query("post_logout_redirect_uri") || undefined;
  const state = c.req.query("state") || undefined;

  const validated = await validateLogoutRequest(
    c,
    idTokenHint,
    clientId,
    postLogoutRedirectUri,
  );
  if (!validated.ok) {
    return c.html(
      logoutShell(`<p class="err">${escapeHtml(validated.error)}</p>`),
      validated.status as 400,
    );
  }

  const sessionUserId = await cookieUserId(c);
  if (
    !mustPrompt(c, sessionUserId, validated.tokenUserId) ||
    sessionUserId == null
  ) {
    return doLogout(c, {
      userId: validated.tokenUserId ?? sessionUserId,
      postLogoutRedirectUri,
      state,
    });
  }

  const { secret, token } = issueCsrfToken(getCookie(c, "csrftoken"));
  setCookie(c, "csrftoken", secret, {
    path: "/",
    httpOnly: false,
    sameSite: c.env.ENVIRONMENT === "production" ? "None" : "Lax",
    secure: c.env.ENVIRONMENT === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return c.html(
    logoutShell(`
      <h1>Confirm logout</h1>
      <p>Do you want to log out of VideoQ?</p>
      <form method="post" action="/api/oauth/logout/">
        <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(token)}"/>
        <input type="hidden" name="id_token_hint" value="${escapeHtml(idTokenHint || "")}"/>
        <input type="hidden" name="client_id" value="${escapeHtml(clientId || "")}"/>
        <input type="hidden" name="post_logout_redirect_uri" value="${escapeHtml(postLogoutRedirectUri || "")}"/>
        <input type="hidden" name="state" value="${escapeHtml(state || "")}"/>
        <button type="submit" name="allow" value="1">Yes, log out</button>
        <button type="submit" name="deny" value="1">Cancel</button>
      </form>`),
  );
};

const logoutPost = async (c: Context<AppEnv>) => {
  if (!isOidcRpLogoutEnabled(c.env)) return oidcDisabled(c);
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }
  if (
    !verifyDjangoCsrfToken(getCookie(c, "csrftoken"), form.csrfmiddlewaretoken)
  ) {
    return c.html(logoutShell(`<p class="err">CSRF Failed</p>`), 403);
  }
  if ("deny" in form) {
    return c.html(logoutShell(`<p>Logout cancelled.</p>`));
  }
  const idTokenHint = form.id_token_hint || undefined;
  const clientId = form.client_id || undefined;
  const postLogoutRedirectUri = form.post_logout_redirect_uri || undefined;
  const state = form.state || undefined;
  const validated = await validateLogoutRequest(
    c,
    idTokenHint,
    clientId,
    postLogoutRedirectUri,
  );
  if (!validated.ok) {
    return c.html(
      logoutShell(`<p class="err">${escapeHtml(validated.error)}</p>`),
      validated.status as 400,
    );
  }
  const sessionUserId = await cookieUserId(c);
  return doLogout(c, {
    userId: validated.tokenUserId ?? sessionUserId,
    postLogoutRedirectUri,
    state,
  });
};

// Discovery / JWKS（root + /api/oauth/ prefix、DOT と同様）
for (const base of ["", "/api/oauth"]) {
  oauthOidcRoutes.get(`${base}/.well-known/openid-configuration`, discovery);
  oauthOidcRoutes.get(`${base}/.well-known/openid-configuration/`, discovery);
  oauthOidcRoutes.get(`${base}/.well-known/jwks.json`, jwks);
  oauthOidcRoutes.get(`${base}/.well-known/jwks.json/`, jwks);
}

oauthOidcRoutes.get("/api/oauth/userinfo", userinfo);
oauthOidcRoutes.get("/api/oauth/userinfo/", userinfo);
oauthOidcRoutes.post("/api/oauth/userinfo", userinfo);
oauthOidcRoutes.post("/api/oauth/userinfo/", userinfo);

oauthOidcRoutes.get("/api/oauth/logout", logoutGet);
oauthOidcRoutes.get("/api/oauth/logout/", logoutGet);
oauthOidcRoutes.post("/api/oauth/logout", logoutPost);
oauthOidcRoutes.post("/api/oauth/logout/", logoutPost);
