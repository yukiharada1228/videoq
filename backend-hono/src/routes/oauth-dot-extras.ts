import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import {
  DEFAULT_SCOPES,
  DEVICE_CODE_EXPIRE_SECONDS,
  DEVICE_FLOW_INTERVAL,
  DEVICE_GRANT_TYPE,
  OAUTH_SCOPES,
  escapeHtml,
  issuerFromEnv,
} from "../lib/oauth";
import {
  bearerHasIntrospectionScope,
  createDeviceGrant,
  createManualApplication,
  deleteOAuthApplicationCascade,
  findApplicationByClientId,
  findDeviceGrantByUserCode,
  findTokenForIntrospection,
  getApplicationForUser,
  listApplicationsForUser,
  listAuthorizedTokens,
  revokeAuthorizedToken,
  updateDeviceGrantStatus,
  updateManualApplication,
  verifyClientSecret,
  type OAuthApplication,
} from "../repositories/oauth-repository";
import { issueCsrfToken, verifyDjangoCsrfToken } from "../utils/csrf";
import type { AppEnv } from "../types/bindings";

/**
 * DOT 裾野の移植:
 * - RFC 7662 introspect
 * - RFC 8628 device authorization + HTML
 * - applications / authorized_tokens HTML（JWT Cookie）
 */
export const oauthDotExtrasRoutes = new Hono<AppEnv>();

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

function loginRedirect(c: Context<AppEnv>): Response {
  const next = encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search);
  const front = (c.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  return c.redirect(`${front}/login?next=${next}`, 302);
}

/** Cookie に secret を載せ、form 用 masked token を返す。 */
function issueCsrfForHtml(c: Context<AppEnv>): string {
  const { secret, token } = issueCsrfToken(getCookie(c, "csrftoken"));
  setCookie(c, "csrftoken", secret, {
    path: "/",
    httpOnly: false,
    sameSite: c.env.ENVIRONMENT === "production" ? "None" : "Lax",
    secure: c.env.ENVIRONMENT === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return token;
}

function oauthJsonError(
  c: Context<AppEnv>,
  status: 400 | 401 | 403 | 404,
  error: string,
  description?: string,
) {
  return c.json(
    description ? { error, error_description: description } : { error },
    status,
  );
}

async function authenticateClientForm(
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
      description: "No application found for client_id.",
    };
  }
  if (app.client_type === "confidential") {
    if (!(await verifyClientSecret(app, clientSecret))) {
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

// ─── introspect (RFC 7662) ───────────────────────────────────

const introspect = async (c: Context<AppEnv>) => {
  const form: Record<string, string> = {};
  if (c.req.method !== "GET") {
    const body = await c.req.parseBody();
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === "string") form[k] = v;
    }
  }
  const token = (form.token || c.req.query("token") || "").trim();

  // DOT ClientProtectedScopedResourceView:
  // 1) client 認証成功 → scope 不要  2) そうでなければ Bearer + introspection
  const authz = c.req.header("Authorization") || "";
  const clientAuth = await authenticateClientForm(c, form);
  let allowed = false;
  if (authz.startsWith("Basic ") || (form.client_id || "").trim()) {
    if (!clientAuth.ok) {
      return oauthJsonError(
        c,
        clientAuth.status,
        clientAuth.error,
        clientAuth.description,
      );
    }
    allowed = true;
  } else {
    const bearerTok = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (bearerTok && (await bearerHasIntrospectionScope(c.env, bearerTok))) {
      allowed = true;
    }
  }
  if (!allowed) return c.body(null, 403);
  if (!token) {
    return oauthJsonError(
      c,
      400,
      "invalid_request",
      "Token parameter is missing.",
    );
  }
  const active = await findTokenForIntrospection(c.env, token);
  if (!active) return c.json({ active: false });
  return c.json({
    active: true,
    scope: active.scope,
    exp: active.exp,
    client_id: active.client_id || undefined,
    username: active.username ?? undefined,
  });
};

oauthDotExtrasRoutes.get("/api/oauth/introspect", introspect);
oauthDotExtrasRoutes.get("/api/oauth/introspect/", introspect);
oauthDotExtrasRoutes.post("/api/oauth/introspect", introspect);
oauthDotExtrasRoutes.post("/api/oauth/introspect/", introspect);

// ─── device authorization (RFC 8628) ─────────────────────────

const deviceAuthorization = async (c: Context<AppEnv>) => {
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }
  const auth = await authenticateClientForm(c, form);
  if (!auth.ok) {
    return oauthJsonError(c, auth.status, auth.error, auth.description);
  }
  if (auth.app.authorization_grant_type !== DEVICE_GRANT_TYPE) {
    return oauthJsonError(
      c,
      400,
      "unauthorized_client",
      "Application is not authorized for device_code grant",
    );
  }
  const requested = (form.scope || "").trim();
  const scopes = requested
    ? requested.split(/\s+/).filter((s) => s in OAUTH_SCOPES)
    : [...DEFAULT_SCOPES];
  const scope = (scopes.length ? scopes : [...DEFAULT_SCOPES]).join(" ");
  const grant = await createDeviceGrant(c.env, auth.app.client_id, scope);
  const issuer = issuerFromEnv(c.env, c.req.url);
  const verificationUri = `${issuer}/api/oauth/device/`;
  return c.json({
    device_code: grant.deviceCode,
    user_code: grant.userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(grant.userCode)}`,
    expires_in: DEVICE_CODE_EXPIRE_SECONDS,
    interval: DEVICE_FLOW_INTERVAL,
  });
};

oauthDotExtrasRoutes.post("/api/oauth/device-authorization", deviceAuthorization);
oauthDotExtrasRoutes.post("/api/oauth/device-authorization/", deviceAuthorization);

function deviceShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)} — VideoQ</title>
<style>
body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;color:#111}
label{display:block;margin:.75rem 0 .25rem;font-weight:600}
input,select,textarea{width:100%;padding:.5rem;font:inherit}
button,.btn{display:inline-block;margin:.5rem .5rem 0 0;padding:.5rem 1rem;font:inherit;cursor:pointer}
.err{color:#b00020;margin:1rem 0}
ul{padding-left:1.2rem}
a{color:#0645ad}
</style></head><body>${body}</body></html>`;
}

const deviceUserCodeGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const preset = c.req.query("user_code") || "";
  const csrf = issueCsrfForHtml(c);
  return c.html(
    deviceShell(
      "Device login",
      `<h1>Enter device code</h1>
       <form method="post" action="/api/oauth/device/">
         <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(csrf)}"/>
         <label for="user_code">User code</label>
         <input id="user_code" name="user_code" value="${escapeHtml(preset)}" autocomplete="one-time-code" required/>
         <button type="submit">Continue</button>
       </form>`,
    ),
  );
};

const deviceUserCodePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }
  if (
    !verifyDjangoCsrfToken(getCookie(c, "csrftoken"), form.csrfmiddlewaretoken)
  ) {
    return c.html(
      deviceShell("Device login", `<p class="err">CSRF Failed</p>`),
      403,
    );
  }
  const code = (form.user_code || "").trim().replace(/[\s-]/g, "");
  const grant = await findDeviceGrantByUserCode(c.env, code);
  if (!grant || grant.status === "expired") {
    return c.html(
      deviceShell(
        "Device login",
        `<p class="err">Invalid or expired user code.</p>
         <p><a href="/api/oauth/device/">Try again</a></p>`,
      ),
      400,
    );
  }
  if (grant.status !== "authorization-pending") {
    return c.redirect(
      `/api/oauth/device-grant-status/${encodeURIComponent(grant.clientId)}/${encodeURIComponent(grant.userCode)}`,
      302,
    );
  }
  return c.redirect(
    `/api/oauth/device-confirm/${encodeURIComponent(grant.clientId)}/${encodeURIComponent(grant.userCode)}`,
    302,
  );
};

oauthDotExtrasRoutes.get("/api/oauth/device", deviceUserCodeGet);
oauthDotExtrasRoutes.get("/api/oauth/device/", deviceUserCodeGet);
oauthDotExtrasRoutes.post("/api/oauth/device", deviceUserCodePost);
oauthDotExtrasRoutes.post("/api/oauth/device/", deviceUserCodePost);

const deviceConfirmGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const clientId = c.req.param("clientId") ?? "";
  const userCode = c.req.param("userCode") ?? "";
  const grant = await findDeviceGrantByUserCode(c.env, userCode, clientId);
  if (!grant || grant.status !== "authorization-pending") {
    return c.redirect(
      `/api/oauth/device-grant-status/${encodeURIComponent(clientId)}/${encodeURIComponent(userCode)}`,
      302,
    );
  }
  const app = await findApplicationByClientId(c.env, clientId);
  const csrf = issueCsrfForHtml(c);
  const scopes = grant.scope
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => OAUTH_SCOPES[s] || s);
  return c.html(
    deviceShell(
      "Authorize device",
      `<h1>Authorize ${escapeHtml(app?.name || clientId)}</h1>
       <p>User code: <strong>${escapeHtml(grant.userCode)}</strong></p>
       <ul>${scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
       <form method="post">
         <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(csrf)}"/>
         <button type="submit" name="allow" value="Authorize">Accept</button>
         <button type="submit" name="deny" value="Deny">Deny</button>
       </form>`,
    ),
  );
};

const deviceConfirmPost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const clientId = c.req.param("clientId") ?? "";
  const userCode = c.req.param("userCode") ?? "";
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }
  if (
    !verifyDjangoCsrfToken(getCookie(c, "csrftoken"), form.csrfmiddlewaretoken)
  ) {
    return c.html(deviceShell("Authorize device", `<p class="err">CSRF Failed</p>`), 403);
  }
  const grant = await findDeviceGrantByUserCode(c.env, userCode, clientId);
  if (!grant || grant.status !== "authorization-pending") {
    return c.redirect(
      `/api/oauth/device-grant-status/${encodeURIComponent(clientId)}/${encodeURIComponent(userCode)}`,
      302,
    );
  }
  if ("deny" in form) {
    await updateDeviceGrantStatus(c.env, grant.id, "denied", userId);
  } else {
    await updateDeviceGrantStatus(c.env, grant.id, "authorized", userId);
  }
  return c.redirect(
    `/api/oauth/device-grant-status/${encodeURIComponent(clientId)}/${encodeURIComponent(userCode)}`,
    302,
  );
};

oauthDotExtrasRoutes.get(
  "/api/oauth/device-confirm/:clientId/:userCode",
  deviceConfirmGet,
);
oauthDotExtrasRoutes.post(
  "/api/oauth/device-confirm/:clientId/:userCode",
  deviceConfirmPost,
);

const deviceStatus = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const clientId = c.req.param("clientId") ?? "";
  const userCode = c.req.param("userCode") ?? "";
  const grant = await findDeviceGrantByUserCode(c.env, userCode, clientId);
  const status = grant?.status ?? "unknown";
  return c.html(
    deviceShell(
      "Device status",
      `<h1>Device authorization status</h1>
       <p>Status: <strong>${escapeHtml(status)}</strong></p>
       <p><a href="/api/oauth/device/">Enter another code</a></p>`,
    ),
  );
};

oauthDotExtrasRoutes.get(
  "/api/oauth/device-grant-status/:clientId/:userCode",
  deviceStatus,
);

// ─── applications HTML ───────────────────────────────────────

const GRANT_OPTIONS = [
  ["authorization-code", "Authorization code"],
  ["implicit", "Implicit"],
  ["password", "Resource owner password-based"],
  ["client-credentials", "Client credentials"],
  [DEVICE_GRANT_TYPE, "Device code"],
  ["openid-hybrid", "OpenID connect hybrid"],
] as const;

function appForm(
  csrf: string,
  action: string,
  app?: OAuthApplication,
  secretOnce?: string | null,
): string {
  const name = app?.name ?? "";
  const redirect = app?.redirect_uris ?? "";
  const clientType = app?.client_type ?? "confidential";
  const grant = app?.authorization_grant_type ?? "authorization-code";
  const opts = GRANT_OPTIONS.map(
    ([v, label]) =>
      `<option value="${escapeHtml(v)}"${grant === v ? " selected" : ""}>${escapeHtml(label)}</option>`,
  ).join("");
  const secretNote = secretOnce
    ? `<p class="err">Client secret (copy now): <code>${escapeHtml(secretOnce)}</code></p>`
    : "";
  return `${secretNote}
    <form method="post" action="${escapeHtml(action)}">
      <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(csrf)}"/>
      <label>Name</label><input name="name" value="${escapeHtml(name)}" required/>
      <label>Client type</label>
      <select name="client_type">
        <option value="confidential"${clientType === "confidential" ? " selected" : ""}>Confidential</option>
        <option value="public"${clientType === "public" ? " selected" : ""}>Public</option>
      </select>
      <label>Authorization grant type</label>
      <select name="authorization_grant_type">${opts}</select>
      <label>Redirect uris (space-separated)</label>
      <textarea name="redirect_uris" rows="3">${escapeHtml(redirect)}</textarea>
      <button type="submit">Save</button>
    </form>`;
}

const appsList = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const apps = await listApplicationsForUser(c.env, userId);
  const items = apps
    .map(
      (a) =>
        `<li><a href="/api/oauth/applications/${a.id}/">${escapeHtml(a.name || a.client_id)}</a>
         — ${escapeHtml(a.authorization_grant_type)}</li>`,
    )
    .join("");
  return c.html(
    deviceShell(
      "Applications",
      `<h1>Your applications</h1>
       <p><a class="btn" href="/api/oauth/applications/register/">Register new</a></p>
       <ul>${items || "<li>None</li>"}</ul>
       <p><a href="/api/oauth/authorized_tokens/">Authorized tokens</a></p>`,
    ),
  );
};

const appsRegisterGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const csrf = issueCsrfForHtml(c);
  return c.html(
    deviceShell(
      "Register application",
      `<h1>Register application</h1>${appForm(csrf, "/api/oauth/applications/register/")}`,
    ),
  );
};

async function readAppForm(c: Context<AppEnv>): Promise<
  | { ok: true; data: { name: string; clientType: "public" | "confidential"; authorizationGrantType: string; redirectUris: string } }
  | { ok: false; response: Response }
> {
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }
  if (
    !verifyDjangoCsrfToken(getCookie(c, "csrftoken"), form.csrfmiddlewaretoken)
  ) {
    return {
      ok: false,
      response: c.html(deviceShell("Applications", `<p class="err">CSRF Failed</p>`), 403),
    };
  }
  const clientType =
    form.client_type === "public" ? "public" : "confidential";
  return {
    ok: true,
    data: {
      name: (form.name || "").trim(),
      clientType,
      authorizationGrantType: (form.authorization_grant_type || "").trim(),
      redirectUris: (form.redirect_uris || "").trim(),
    },
  };
}

const appsRegisterPost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const parsed = await readAppForm(c);
  if (!parsed.ok) return parsed.response;
  const created = await createManualApplication(c.env, userId, parsed.data);
  const q = created.clientSecretPlain
    ? `?secret=${encodeURIComponent(created.clientSecretPlain)}`
    : "";
  return c.redirect(`/api/oauth/applications/${created.application.id}/${q}`, 302);
};

const appsDetail = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const secret = c.req.query("secret");
  return c.html(
    deviceShell(
      app.name || "Application",
      `<h1>${escapeHtml(app.name || app.client_id)}</h1>
       ${secret ? `<p class="err">Client secret (copy now): <code>${escapeHtml(secret)}</code></p>` : ""}
       <dl>
         <dt>Client id</dt><dd><code>${escapeHtml(app.client_id)}</code></dd>
         <dt>Client type</dt><dd>${escapeHtml(app.client_type)}</dd>
         <dt>Grant type</dt><dd>${escapeHtml(app.authorization_grant_type)}</dd>
         <dt>Redirect uris</dt><dd><pre>${escapeHtml(app.redirect_uris)}</pre></dd>
       </dl>
       <p>
         <a href="/api/oauth/applications/${app.id}/update/">Edit</a>
         <a href="/api/oauth/applications/${app.id}/delete/">Delete</a>
         <a href="/api/oauth/applications/">Back</a>
       </p>`,
    ),
  );
};

const appsUpdateGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const csrf = issueCsrfForHtml(c);
  return c.html(
    deviceShell(
      "Update application",
      `<h1>Update application</h1>${appForm(csrf, `/api/oauth/applications/${id}/update/`, app)}`,
    ),
  );
};

const appsUpdatePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const parsed = await readAppForm(c);
  if (!parsed.ok) return parsed.response;
  const updated = await updateManualApplication(c.env, userId, id, parsed.data);
  if (!updated) {
    return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  }
  return c.redirect(`/api/oauth/applications/${id}/`, 302);
};

const appsDeleteGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const csrf = issueCsrfForHtml(c);
  return c.html(
    deviceShell(
      "Delete application",
      `<h1>Delete ${escapeHtml(app.name || app.client_id)}?</h1>
       <form method="post">
         <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(csrf)}"/>
         <button type="submit">Confirm delete</button>
         <a href="/api/oauth/applications/${id}/">Cancel</a>
       </form>`,
    ),
  );
};

const appsDeletePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const body = await c.req.parseBody();
  const csrf =
    typeof body.csrfmiddlewaretoken === "string" ? body.csrfmiddlewaretoken : "";
  if (!verifyDjangoCsrfToken(getCookie(c, "csrftoken"), csrf)) {
    return c.html(deviceShell("Application", `<p class="err">CSRF Failed</p>`), 403);
  }
  await deleteOAuthApplicationCascade(c.env, id);
  return c.redirect("/api/oauth/applications/", 302);
};

oauthDotExtrasRoutes.get("/api/oauth/applications", appsList);
oauthDotExtrasRoutes.get("/api/oauth/applications/", appsList);
oauthDotExtrasRoutes.get("/api/oauth/applications/register", appsRegisterGet);
oauthDotExtrasRoutes.get("/api/oauth/applications/register/", appsRegisterGet);
oauthDotExtrasRoutes.post("/api/oauth/applications/register", appsRegisterPost);
oauthDotExtrasRoutes.post("/api/oauth/applications/register/", appsRegisterPost);
oauthDotExtrasRoutes.get("/api/oauth/applications/:id{[0-9]+}", appsDetail);
oauthDotExtrasRoutes.get("/api/oauth/applications/:id{[0-9]+}/", appsDetail);
oauthDotExtrasRoutes.get("/api/oauth/applications/:id{[0-9]+}/update", appsUpdateGet);
oauthDotExtrasRoutes.get("/api/oauth/applications/:id{[0-9]+}/update/", appsUpdateGet);
oauthDotExtrasRoutes.post("/api/oauth/applications/:id{[0-9]+}/update", appsUpdatePost);
oauthDotExtrasRoutes.post("/api/oauth/applications/:id{[0-9]+}/update/", appsUpdatePost);
oauthDotExtrasRoutes.get("/api/oauth/applications/:id{[0-9]+}/delete", appsDeleteGet);
oauthDotExtrasRoutes.get("/api/oauth/applications/:id{[0-9]+}/delete/", appsDeleteGet);
oauthDotExtrasRoutes.post("/api/oauth/applications/:id{[0-9]+}/delete", appsDeletePost);
oauthDotExtrasRoutes.post("/api/oauth/applications/:id{[0-9]+}/delete/", appsDeletePost);

// ─── authorized_tokens HTML ──────────────────────────────────

const tokensHtmlList = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const tokens = await listAuthorizedTokens(c.env, userId);
  const csrf = issueCsrfForHtml(c);
  const rows = tokens
    .map(
      (t) =>
        `<tr>
          <td>${escapeHtml(t.client_name || t.client_id)}</td>
          <td>${escapeHtml(t.scope || "")}</td>
          <td>${escapeHtml(t.issued_at || "")}</td>
          <td>
            <form method="post" action="/api/oauth/authorized_tokens/${t.id}/delete/" style="display:inline">
              <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(csrf)}"/>
              <button type="submit">Revoke</button>
            </form>
          </td>
        </tr>`,
    )
    .join("");
  return c.html(
    deviceShell(
      "Authorized tokens",
      `<h1>Authorized tokens</h1>
       <table border="1" cellpadding="6" cellspacing="0">
         <tr><th>Client</th><th>Scope</th><th>Issued</th><th></th></tr>
         ${rows || "<tr><td colspan=4>None</td></tr>"}
       </table>
       <p><a href="/api/oauth/applications/">Applications</a></p>`,
    ),
  );
};

const tokensHtmlDelete = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const csrf =
    typeof body.csrfmiddlewaretoken === "string" ? body.csrfmiddlewaretoken : "";
  if (!verifyDjangoCsrfToken(getCookie(c, "csrftoken"), csrf)) {
    return c.html(deviceShell("Authorized tokens", `<p class="err">CSRF Failed</p>`), 403);
  }
  await revokeAuthorizedToken(c.env, userId, id);
  return c.redirect("/api/oauth/authorized_tokens/", 302);
};

oauthDotExtrasRoutes.get("/api/oauth/authorized_tokens", tokensHtmlList);
oauthDotExtrasRoutes.get("/api/oauth/authorized_tokens/", tokensHtmlList);
oauthDotExtrasRoutes.post(
  "/api/oauth/authorized_tokens/:id{[0-9]+}/delete",
  tokensHtmlDelete,
);
oauthDotExtrasRoutes.post(
  "/api/oauth/authorized_tokens/:id{[0-9]+}/delete/",
  tokensHtmlDelete,
);
