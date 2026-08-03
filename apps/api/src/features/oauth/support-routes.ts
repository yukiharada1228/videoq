import {
  createFeatureRouter,
  createRoute,
  jsonResponse,
  z,
} from "../../shared/openapi";
import type { Context } from "hono";
import { OAUTH_SCOPES, escapeHtml } from "../../lib/oauth";
import {
  findApplicationByClientId,
  findDeviceGrantByUserCode,
} from "../../repositories/oauth-repository";
import type { AppEnv } from "../../types/bindings";
import * as supportService from "./support-service";
import {
  cookieUserId,
  consumeFormActionToken,
  issueFormActionToken,
  loginRedirect,
} from "./html-helpers";
import * as htmlService from "./html-service";
import {
  appForm,
  deviceConfirmForm,
  deviceShell,
  deviceUserCodeForm,
} from "./html-templates";
import {
  oauthDeviceAuthorizationResponseSchema,
  oauthProtocolErrorSchema,
  oauthFormBodySchema,
  oauthIntrospectActiveSchema,
  oauthIntrospectInactiveSchema,
} from "./schemas";

/**
 * OAuth supporting endpoints and browser management UI.
 */
export const oauthSupportRoutes = createFeatureRouter();

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

async function parseFormBody(c: Context<AppEnv>): Promise<Record<string, string>> {
  const body = await c.req.parseBody();
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") form[k] = v;
  }
  return form;
}

function deviceGrantStatusPath(clientId: string, userCode: string): string {
  return `/api/oauth/device-grant-status/${encodeURIComponent(clientId)}/${encodeURIComponent(userCode)}`;
}

function deviceConfirmPath(clientId: string, userCode: string): string {
  return `/api/oauth/device-confirm/${encodeURIComponent(clientId)}/${encodeURIComponent(userCode)}`;
}

// ─── introspect (RFC 7662) ───────────────────────────────────

const introspectRoute = createRoute({
  method: "post",
  path: "/introspect",
  tags: ["OAuth"],
  summary: "Token introspection (RFC 7662)",
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": { schema: oauthFormBodySchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(
      z.union([oauthIntrospectActiveSchema, oauthIntrospectInactiveSchema]),
      "Introspection result",
    ),
    400: jsonResponse(oauthProtocolErrorSchema, "Invalid request"),
    401: jsonResponse(oauthProtocolErrorSchema, "Invalid client"),
    403: { description: "Forbidden" },
  },
});

const introspectHandler = async (
  c: Context<AppEnv>,
  form: Record<string, string>,
) => {
  const token = (form.token || "").trim();
  const result = await supportService.introspectToken(c.env, {
    token,
    form,
    authorizationHeader: c.req.header("Authorization") || "",
  });
  if (result.kind === "forbidden") return c.body(null, 403);
  if (result.kind === "error") {
    const { status, error, description } = result.error;
    return oauthJsonError(c, status, error, description);
  }
  if (result.kind === "inactive") return c.json({ active: false });
  return c.json(result.body);
};

oauthSupportRoutes.openapi(introspectRoute, (c) =>
  introspectHandler(c, c.req.valid("form") as Record<string, string>),
);

// ─── device authorization (RFC 8628) ─────────────────────────

const deviceAuthorizationRoute = createRoute({
  method: "post",
  path: "/device-authorization",
  tags: ["OAuth"],
  summary: "Device authorization (RFC 8628)",
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": { schema: oauthFormBodySchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(oauthDeviceAuthorizationResponseSchema),
    400: jsonResponse(oauthProtocolErrorSchema),
    401: jsonResponse(oauthProtocolErrorSchema),
  },
});

const deviceAuthorizationHandler = async (
  c: Context<AppEnv>,
  form: Record<string, string>,
) => {
  const result = await supportService.authorizeDevice(c.env, c.req.url, {
    form,
    authorizationHeader: c.req.header("Authorization"),
  });
  if (result.kind === "error") {
    const { status, error, description } = result.error;
    return oauthJsonError(c, status, error, description);
  }
  return c.json(result.body);
};

oauthSupportRoutes.openapi(deviceAuthorizationRoute, (c) =>
  deviceAuthorizationHandler(
    c,
    c.req.valid("form") as Record<string, string>,
  ),
);

const deviceUserCodeGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const preset = c.req.query("user_code") || "";
  const actionToken = await issueFormActionToken(c, userId);
  return c.html(
    deviceShell("Device login", deviceUserCodeForm(actionToken, preset)),
  );
};

const deviceUserCodePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const form = await parseFormBody(c);
  if (!(await consumeFormActionToken(c, userId, form.action_token))) {
    return c.html(
      deviceShell("Device login", `<p class="err">Form authorization failed</p>`),
      403,
    );
  }
  const code = (form.user_code || "").trim().replace(/[\s-]/g, "");
  const flow = await supportService.resolveDeviceUserCodeFlow(c.env, code);
  if (flow.action === "invalid") {
    return c.html(
      deviceShell(
        "Device login",
        `<p class="err">Invalid or expired user code.</p>
         <p><a href="/api/oauth/device">Try again</a></p>`,
      ),
      400,
    );
  }
  if (flow.action === "redirect_status") {
    return c.redirect(deviceGrantStatusPath(flow.clientId, flow.userCode), 302);
  }
  return c.redirect(deviceConfirmPath(flow.clientId, flow.userCode), 302);
};

oauthSupportRoutes.get("/device", deviceUserCodeGet);
oauthSupportRoutes.post("/device", deviceUserCodePost);

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
  const actionToken = await issueFormActionToken(c, userId);
  const scopes = grant.scope
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => OAUTH_SCOPES[s] || s);
  return c.html(
    deviceShell(
      "Authorize device",
      deviceConfirmForm(
        actionToken,
        app?.name || clientId,
        grant.userCode,
        scopes,
      ),
    ),
  );
};

const deviceConfirmPost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const clientId = c.req.param("clientId") ?? "";
  const userCode = c.req.param("userCode") ?? "";
  const form = await parseFormBody(c);
  if (!(await consumeFormActionToken(c, userId, form.action_token))) {
    return c.html(
      deviceShell(
        "Authorize device",
        `<p class="err">Form authorization failed</p>`,
      ),
      403,
    );
  }
  const decision = await supportService.resolveDeviceConfirmDecision(
    c.env,
    clientId,
    userCode,
    userId,
    "deny" in form,
  );
  return c.redirect(deviceGrantStatusPath(decision.clientId, decision.userCode), 302);
};

oauthSupportRoutes.get(
  "/device-confirm/:clientId/:userCode",
  deviceConfirmGet,
);
oauthSupportRoutes.post(
  "/device-confirm/:clientId/:userCode",
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
       <p><a href="/api/oauth/device">Enter another code</a></p>`,
    ),
  );
};

oauthSupportRoutes.get(
  "/device-grant-status/:clientId/:userCode",
  deviceStatus,
);

// ─── applications HTML ───────────────────────────────────────

const appsList = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const apps = await htmlService.listApplicationsForUser(c.env, userId);
  const items = apps
    .map(
      (a) =>
        `<li><a href="/api/oauth/applications/${a.id}">${escapeHtml(a.name || a.client_id)}</a>
         — ${escapeHtml(a.authorization_grant_type)}</li>`,
    )
    .join("");
  return c.html(
    deviceShell(
      "Applications",
      `<h1>Your applications</h1>
       <p><a class="btn" href="/api/oauth/applications/register">Register new</a></p>
       <ul>${items || "<li>None</li>"}</ul>
       <p><a href="/api/oauth/authorized_tokens">Authorized tokens</a></p>`,
    ),
  );
};

const appsRegisterGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const actionToken = await issueFormActionToken(c, userId);
  return c.html(
    deviceShell(
      "Register application",
      `<h1>Register application</h1>${appForm(actionToken, "/api/oauth/applications/register")}`,
    ),
  );
};

async function readAppForm(c: Context<AppEnv>, userId: number): Promise<
  | { ok: true; data: htmlService.AppFormData }
  | { ok: false; response: Response }
> {
  const form = await parseFormBody(c);
  if (!(await consumeFormActionToken(c, userId, form.action_token))) {
    return {
      ok: false,
      response: c.html(
        deviceShell("Applications", `<p class="err">Form authorization failed</p>`),
        403,
      ),
    };
  }
  return { ok: true, data: htmlService.parseAppFormData(form) };
}

const appsRegisterPost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const parsed = await readAppForm(c, userId);
  if (!parsed.ok) return parsed.response;
  const created = await htmlService.createManualApplication(c.env, userId, parsed.data);
  const q = created.clientSecretPlain
    ? `?secret=${encodeURIComponent(created.clientSecretPlain)}`
    : "";
  return c.redirect(`/api/oauth/applications/${created.application.id}${q}`, 302);
};

const appsDetail = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await htmlService.getApplicationForUser(c.env, userId, id);
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
         <a href="/api/oauth/applications/${app.id}/update">Edit</a>
         <a href="/api/oauth/applications/${app.id}/delete">Delete</a>
         <a href="/api/oauth/applications">Back</a>
       </p>`,
    ),
  );
};

const appsUpdateGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await htmlService.getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const actionToken = await issueFormActionToken(c, userId);
  return c.html(
    deviceShell(
      "Update application",
      `<h1>Update application</h1>${appForm(actionToken, `/api/oauth/applications/${id}/update`, app)}`,
    ),
  );
};

const appsUpdatePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const parsed = await readAppForm(c, userId);
  if (!parsed.ok) return parsed.response;
  const updated = await htmlService.updateManualApplication(c.env, userId, id, parsed.data);
  if (!updated) {
    return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  }
  return c.redirect(`/api/oauth/applications/${id}`, 302);
};

const appsDeleteGet = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await htmlService.getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const actionToken = await issueFormActionToken(c, userId);
  return c.html(
    deviceShell(
      "Delete application",
      `<h1>Delete ${escapeHtml(app.name || app.client_id)}?</h1>
       <form method="post">
         <input type="hidden" name="action_token" value="${escapeHtml(actionToken)}"/>
         <button type="submit">Confirm delete</button>
         <a href="/api/oauth/applications/${id}">Cancel</a>
       </form>`,
    ),
  );
};

const appsDeletePost = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const app = await htmlService.getApplicationForUser(c.env, userId, id);
  if (!app) return c.html(deviceShell("Application", `<p class="err">Not found</p>`), 404);
  const body = await c.req.parseBody();
  const actionToken =
    typeof body.action_token === "string" ? body.action_token : "";
  if (!(await consumeFormActionToken(c, userId, actionToken))) {
    return c.html(
      deviceShell("Application", `<p class="err">Form authorization failed</p>`),
      403,
    );
  }
  await htmlService.deleteOAuthApplicationCascade(c.env, id);
  return c.redirect("/api/oauth/applications", 302);
};

oauthSupportRoutes.get("/applications", appsList);
oauthSupportRoutes.get("/applications/register", appsRegisterGet);
oauthSupportRoutes.post("/applications/register", appsRegisterPost);
oauthSupportRoutes.get("/applications/:id{[0-9]+}", appsDetail);
oauthSupportRoutes.get("/applications/:id{[0-9]+}/update", appsUpdateGet);
oauthSupportRoutes.post("/applications/:id{[0-9]+}/update", appsUpdatePost);
oauthSupportRoutes.get("/applications/:id{[0-9]+}/delete", appsDeleteGet);
oauthSupportRoutes.post("/applications/:id{[0-9]+}/delete", appsDeletePost);

// ─── authorized_tokens HTML ──────────────────────────────────

const tokensHtmlList = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const tokens = await htmlService.listAuthorizedTokens(c.env, userId);
  const rows = (
    await Promise.all(
      tokens.map(async (t) => {
        const actionToken = await issueFormActionToken(c, userId);
        return (
        `<tr>
          <td>${escapeHtml(t.client_name || t.client_id)}</td>
          <td>${escapeHtml(t.scope || "")}</td>
          <td>${escapeHtml(t.issued_at || "")}</td>
          <td>
            <form method="post" action="/api/oauth/authorized_tokens/${t.id}/delete" style="display:inline">
              <input type="hidden" name="action_token" value="${escapeHtml(actionToken)}"/>
              <button type="submit">Revoke</button>
            </form>
          </td>
        </tr>`
        );
      }),
    )
  ).join("");
  return c.html(
    deviceShell(
      "Authorized tokens",
      `<h1>Authorized tokens</h1>
       <table border="1" cellpadding="6" cellspacing="0">
         <tr><th>Client</th><th>Scope</th><th>Issued</th><th></th></tr>
         ${rows || "<tr><td colspan=4>None</td></tr>"}
       </table>
       <p><a href="/api/oauth/applications">Applications</a></p>`,
    ),
  );
};

const tokensHtmlDelete = async (c: Context<AppEnv>) => {
  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const actionToken =
    typeof body.action_token === "string" ? body.action_token : "";
  if (!(await consumeFormActionToken(c, userId, actionToken))) {
    return c.html(
      deviceShell(
        "Authorized tokens",
        `<p class="err">Form authorization failed</p>`,
      ),
      403,
    );
  }
  await htmlService.revokeAuthorizedToken(c.env, userId, id);
  return c.redirect("/api/oauth/authorized_tokens", 302);
};

oauthSupportRoutes.get("/authorized_tokens", tokensHtmlList);
oauthSupportRoutes.post(
  "/authorized_tokens/:id{[0-9]+}/delete",
  tokensHtmlDelete,
);
