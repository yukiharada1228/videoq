import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isOidcEnabled, isOidcRpLogoutEnabled } from "../../lib/oidc";
import { escapeHtml, issuerFromEnv } from "../../lib/oauth";
import { revokeAuthSession } from "../../repositories/auth-repository";
import {
  createFeatureRouter,
  createRoute,
  jsonResponse,
  z,
} from "../../shared/openapi";
import type { AppEnv } from "../../types/bindings";
import {
  jwksResponseSchema,
  oauthProtocolErrorSchema,
  oidcUserinfoClaimsSchema,
  openIdConfigurationSchema,
} from "./schemas";
import * as oauthService from "./service";
import * as oidcService from "./oidc-service";
import {
  consumeFormActionToken,
  cookieUserId,
  issueFormActionToken,
} from "./html-helpers";
import { logoutShell } from "./html-templates";

/**
 * VideoQ の OpenID Connect エンドポイント。
 * OIDC_ENABLED が無効な場合は 404 を返す。
 */
export const oauthOidcRoutes = createFeatureRouter();

function oidcDisabled(c: Context<AppEnv>): Response {
  return c.body(null, 404);
}

function requireOidc(c: Context<AppEnv>): boolean {
  return isOidcEnabled(c.env);
}

function registerOidcDiscoveryRoutes(basePath: string) {
  const discoveryRoute = createRoute({
    method: "get",
    path: `${basePath}/.well-known/openid-configuration`,
    tags: ["OIDC"],
    summary: "OpenID Provider configuration",
    responses: {
      200: jsonResponse(openIdConfigurationSchema),
      404: { description: "OIDC disabled" },
    },
  });
  oauthOidcRoutes.openapi(discoveryRoute, (c) => {
    if (!requireOidc(c)) return oidcDisabled(c);
    c.header("Access-Control-Allow-Origin", "*");
    return c.json(oauthService.getOpenIdConfiguration(c.env, c.req.url), 200);
  });

  const jwksRoute = createRoute({
    method: "get",
    path: `${basePath}/.well-known/jwks.json`,
    tags: ["OIDC"],
    summary: "OIDC JWKS",
    responses: {
      200: jsonResponse(jwksResponseSchema),
      404: { description: "OIDC disabled" },
    },
  });
  oauthOidcRoutes.openapi(jwksRoute, async (c) => {
    if (!requireOidc(c)) return oidcDisabled(c);
    const { body, cacheControl } = await oauthService.getJwks(c.env);
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Cache-Control", cacheControl);
    return c.json(body, 200);
  });
}

function extractUserinfoBearer(c: Context<AppEnv>): string {
  const authz = c.req.header("Authorization") || "";
  return authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
}

const userinfo = async (c: Context<AppEnv>, token: string) => {
  if (!requireOidc(c)) return oidcDisabled(c);
  const result = await oidcService.resolveUserinfo(
    c.env,
    token,
  );
  if (!result.ok) {
    return c.json(
      { error: result.error, error_description: result.error_description },
      result.status,
      { "WWW-Authenticate": result.wwwAuthenticate },
    );
  }
  return c.json(result.claims);
};

const userinfoResponses = {
  200: jsonResponse(oidcUserinfoClaimsSchema),
  401: jsonResponse(oauthProtocolErrorSchema, "Invalid or missing token"),
  404: { description: "OIDC disabled" },
};

const userinfoGetRoute = createRoute({
  method: "get",
  path: "/api/oauth/userinfo",
  tags: ["OIDC"],
  summary: "OpenID Connect UserInfo",
  responses: userinfoResponses,
});
oauthOidcRoutes.openapi(userinfoGetRoute, (c) =>
  userinfo(c, extractUserinfoBearer(c)),
);

const userinfoPostRoute = createRoute({
  method: "post",
  path: "/api/oauth/userinfo",
  tags: ["OIDC"],
  summary: "OpenID Connect UserInfo",
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: z.object({ access_token: z.string().min(1) }),
        },
      },
      required: true,
    },
  },
  responses: userinfoResponses,
});
oauthOidcRoutes.openapi(userinfoPostRoute, (c) =>
  userinfo(c, c.req.valid("form").access_token),
);

function clearSessionCookies(c: Context<AppEnv>) {
  const secure = c.env.ENVIRONMENT === "production";
  const name = secure ? "__Host-vq_refresh" : "vq_refresh";
  deleteCookie(c, name, { path: "/" });
  setCookie(c, name, "", {
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
  },
): Promise<Response> {
  await oidcService.revokeTokensForOidcLogoutIfConfigured(c.env, opts.userId);
  const cookieName =
    c.env.ENVIRONMENT === "production" ? "__Host-vq_refresh" : "vq_refresh";
  await revokeAuthSession(c.env, getCookie(c, cookieName));
  clearSessionCookies(c);

  if (opts.postLogoutRedirectUri) {
    const u = new URL(opts.postLogoutRedirectUri);
    if (opts.state) u.searchParams.set("state", opts.state);
    return c.redirect(u.toString(), 302);
  }
  const issuer = issuerFromEnv(c.env, c.req.url);
  return c.redirect(`${issuer}/`, 302);
}

const logoutGet = async (c: Context<AppEnv>) => {
  if (!isOidcRpLogoutEnabled(c.env)) return oidcDisabled(c);
  const idTokenHint = c.req.query("id_token_hint") || undefined;
  const clientId = c.req.query("client_id") || undefined;
  const postLogoutRedirectUri =
    c.req.query("post_logout_redirect_uri") || undefined;
  const state = c.req.query("state") || undefined;

  const validated = await oidcService.validateLogoutRequest(
    c.env,
    c.req.url,
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
    !oidcService.mustPromptLogout(c.env, sessionUserId, validated.tokenUserId) ||
    sessionUserId == null
  ) {
    return doLogout(c, {
      userId: validated.tokenUserId ?? sessionUserId,
      postLogoutRedirectUri,
      state,
    });
  }

  const token = await issueFormActionToken(c, sessionUserId);
  return c.html(
    logoutShell(`
      <h1>Confirm logout</h1>
      <p>Do you want to log out of VideoQ?</p>
      <form method="post" action="/api/oauth/logout">
        <input type="hidden" name="action_token" value="${escapeHtml(token)}"/>
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
  const sessionUserId = await cookieUserId(c);
  if (
    sessionUserId == null ||
    !(await consumeFormActionToken(c, sessionUserId, form.action_token))
  ) {
    return c.html(
      logoutShell(`<p class="err">Form authorization failed</p>`),
      403,
    );
  }
  if ("deny" in form) {
    return c.html(logoutShell(`<p>Logout cancelled.</p>`));
  }
  const idTokenHint = form.id_token_hint || undefined;
  const clientId = form.client_id || undefined;
  const postLogoutRedirectUri = form.post_logout_redirect_uri || undefined;
  const state = form.state || undefined;
  const validated = await oidcService.validateLogoutRequest(
    c.env,
    c.req.url,
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
  return doLogout(c, {
    userId: validated.tokenUserId ?? sessionUserId,
    postLogoutRedirectUri,
    state,
  });
};

// Discovery / JWKS は root と /api/oauth/ の両方で公開する。
registerOidcDiscoveryRoutes("");
registerOidcDiscoveryRoutes("/api/oauth");

oauthOidcRoutes.get("/api/oauth/logout", logoutGet);
oauthOidcRoutes.post("/api/oauth/logout", logoutPost);
