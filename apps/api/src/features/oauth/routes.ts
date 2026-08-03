import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../shared/openapi";
import type { Context } from "hono";
import { requireAuth, jwtMethod } from "../../middleware/auth";
import {
  redirectUriHost,
  renderAuthorizeHtml,
} from "../../lib/oauth";
import {
  findApplicationByClientId,
  verifyClientSecret,
  type OAuthApplication,
} from "../../repositories/oauth-repository";
import type { AppEnv } from "../../types/bindings";
import {
  consumeFormActionToken,
  cookieUserId,
  issueFormActionToken,
  loginRedirect,
} from "./html-helpers";
import {
  dcrClientIdParamSchema,
  dcrClientMetadataSchema,
  dcrClientResponseSchema,
  dcrErrorResponseSchema,
  oauthAuthorizationServerMetadataSchema,
  oauthErrorResponseSchema,
  oauthFormBodySchema,
  oauthProtectedResourceMetadataSchema,
  oauthTokenIdParamSchema,
  oauthTokenListResponseSchema,
  oauthTokenSuccessSchema,
} from "./schemas";
import * as oauthService from "./service";
import * as authorizeService from "./authorize-service";

/**
 * OAuth 2.1 Authorization Server + Settings UI トークン管理。
 *
 * Well-known (`oauthWellKnownRoutes`, absolute paths):
 *   GET /.well-known/oauth-authorization-server(+ optional path)
 *   GET /.well-known/oauth-protected-resource(+ /api/mcp)
 *
 * AS (`oauthRoutes`, `/api/oauth` プレフィックスはアプリ側でマウント):
 *   GET/POST /authorize
 *   POST     /token
 *   POST     /register
 *   GET      /register/:clientId
 *   POST     /revoke_token
 *
 * Settings UI:
 *   GET/DELETE /tokens(/:id)
 */
export const oauthRoutes = createFeatureRouter();

/** RFC 8414/9728 well-known metadata（absolute path のままルートに載せる）。 */
export const oauthWellKnownRoutes = createFeatureRouter();

const jwtOnly = requireAuth(jwtMethod);

// ─── well-known ───────────────────────────────────────────────

function corsStar(c: Context<AppEnv>) {
  c.header("Access-Control-Allow-Origin", "*");
}

function registerAuthorizationServerMetadataRoutes(basePath: string) {
  const bareRoute = createRoute({
    method: "get",
    path: basePath,
    tags: ["OAuth"],
    summary: "OAuth authorization server metadata (RFC 8414)",
    responses: {
      200: jsonResponse(oauthAuthorizationServerMetadataSchema),
    },
  });
  oauthWellKnownRoutes.openapi(bareRoute, (c) => {
    corsStar(c);
    return c.json(
      oauthService.getAuthorizationServerMetadata(c.env, c.req.url),
      200,
    );
  });

  const suffixRoute = createRoute({
    method: "get",
    path: `${basePath}/:issuerPath{.+}`,
    tags: ["OAuth"],
    summary: "OAuth authorization server metadata (path suffix variant)",
    responses: {
      200: jsonResponse(oauthAuthorizationServerMetadataSchema),
    },
  });
  oauthWellKnownRoutes.openapi(suffixRoute, (c) => {
    corsStar(c);
    return c.json(
      oauthService.getAuthorizationServerMetadata(c.env, c.req.url),
      200,
    );
  });
}

function registerProtectedResourceMetadataRoutes(basePath: string) {
  const bareRoute = createRoute({
    method: "get",
    path: basePath,
    tags: ["OAuth"],
    summary: "OAuth protected resource metadata (RFC 9728)",
    responses: {
      200: jsonResponse(oauthProtectedResourceMetadataSchema),
    },
  });
  oauthWellKnownRoutes.openapi(bareRoute, (c) => {
    corsStar(c);
    return c.json(
      oauthService.getProtectedResourceMetadata(c.env, c.req.url),
      200,
    );
  });

  const suffixRoute = createRoute({
    method: "get",
    path: `${basePath}/:resourcePath{.+}`,
    tags: ["OAuth"],
    summary: "OAuth protected resource metadata (path suffix variant)",
    responses: {
      200: jsonResponse(oauthProtectedResourceMetadataSchema),
    },
  });
  oauthWellKnownRoutes.openapi(suffixRoute, (c) => {
    corsStar(c);
    return c.json(
      oauthService.getProtectedResourceMetadata(c.env, c.req.url),
      200,
    );
  });
}

registerAuthorizationServerMetadataRoutes(
  "/.well-known/oauth-authorization-server",
);
registerProtectedResourceMetadataRoutes("/.well-known/oauth-protected-resource");

// RFC 8414/9728: root と /api/oauth/ の両方で metadata を配信する。
registerAuthorizationServerMetadataRoutes(
  "/api/oauth/.well-known/oauth-authorization-server",
);
registerProtectedResourceMetadataRoutes(
  "/api/oauth/.well-known/oauth-protected-resource",
);

// ─── Settings UI tokens ───────────────────────────────────────

const listTokensRoute = createRoute({
  method: "get",
  path: "/tokens",
  tags: ["OAuth"],
  summary: "List authorized OAuth tokens for the current user",
  middleware: [jwtOnly] as const,
  responses: {
    200: jsonResponse(oauthTokenListResponseSchema),
    401: errorResponse("Unauthorized"),
  },
});

oauthRoutes.openapi(listTokensRoute, async (c) => {
  const body = await oauthService.listTokens(c.env, c.var.userId!);
  return c.json(body, 200);
});

const revokeTokenRoute = createRoute({
  method: "delete",
  path: "/tokens/{tokenId}",
  tags: ["OAuth"],
  summary: "Revoke an authorized OAuth token",
  middleware: [jwtOnly] as const,
  request: { params: oauthTokenIdParamSchema },
  responses: {
    204: { description: "Revoked" },
    401: errorResponse("Unauthorized"),
    403: errorResponse("Form authorization failed"),
    404: { description: "Token not found" },
  },
});

oauthRoutes.openapi(revokeTokenRoute, async (c) => {
  const { tokenId } = c.req.valid("param");
  const ok = await oauthService.revokeAuthorizedTokenForUser(
    c.env,
    c.var.userId!,
    tokenId,
  );
  if (!ok) return c.body(null, 404);
  return c.body(null, 204);
});

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

async function issueCodeAndRedirect(
  c: Context<AppEnv>,
  userId: number,
  app: OAuthApplication,
  p: authorizeService.AuthParams,
): Promise<Response> {
  const code = await authorizeService.issueAuthorizationCode(
    c.env,
    userId,
    app,
    p,
  );
  const loc = authorizeService.appendQuery(p.redirectUri, {
    code,
    ...(p.state ? { state: p.state } : {}),
  });
  return c.redirect(loc, 302);
}

function authorizeHtmlError(
  c: Context<AppEnv>,
  opts: {
    status?: 400 | 403;
    applicationName?: string;
    isDcrClient?: boolean;
    error: string;
    description: string;
  },
) {
  return c.html(
    renderAuthorizeHtml({
      applicationName: opts.applicationName ?? "",
      redirectUriHost: null,
      scopesDescriptions: [],
      isDcrClient: opts.isDcrClient ?? false,
      actionToken: "",
      hidden: {},
      error: { error: opts.error, description: opts.description },
    }),
    opts.status ?? 400,
  );
}

// ─── authorize ────────────────────────────────────────────────

const authorizeGet = async (c: Context<AppEnv>) => {
  const q = c.req.query();
  const prepared = await authorizeService.prepareAuthorizeGet(c.env, q);

  // AuthParamsError も `error` キーを持つため、kind の有無で先に分岐する
  if (!("kind" in prepared)) {
    const loc = await authorizeService.resolveAuthorizeErrorRedirect(
      c.env,
      prepared,
      q.client_id,
    );
    if (loc) return c.redirect(loc, 302);
    return authorizeHtmlError(c, {
      error: prepared.error,
      description: prepared.description,
    });
  }

  if (prepared.kind === "html_error") {
    return authorizeHtmlError(c, {
      applicationName: prepared.applicationName,
      isDcrClient: prepared.isDcrClient,
      error: prepared.error,
      description: prepared.description,
    });
  }
  if (prepared.kind === "redirect_error") {
    return c.redirect(prepared.location, 302);
  }

  const userId = await cookieUserId(c);
  if (userId == null) return loginRedirect(c);

  if (prepared.kind === "skip") {
    return issueCodeAndRedirect(c, userId, prepared.app, prepared.params);
  }

  const { app, params } = prepared;
  const actionToken = await issueFormActionToken(c, userId);
  return c.html(
    renderAuthorizeHtml({
      applicationName: app.name || app.client_id,
      redirectUriHost: redirectUriHost(params.redirectUri),
      scopesDescriptions: authorizeService.scopesDescriptions(params.scope),
      isDcrClient: app.registration_source === "dcr" && app.user_id == null,
      actionToken,
      hidden: {
        redirect_uri: params.redirectUri,
        scope: params.scope,
        client_id: params.clientId,
        state: params.state,
        response_type: params.responseType,
        code_challenge: params.codeChallenge,
        code_challenge_method: params.codeChallengeMethod,
        nonce: params.nonce,
        resource: params.resource.join(" "),
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

  if (!(await consumeFormActionToken(c, userId, form.action_token))) {
    return authorizeHtmlError(c, {
      status: 403,
      error: "invalid_request",
      description: "Form authorization failed.",
    });
  }

  const prepared = await authorizeService.prepareAuthorizePost(c.env, form);
  if (prepared.kind === "html_error") {
    return authorizeHtmlError(c, {
      error: prepared.error,
      description: prepared.description,
    });
  }
  if (prepared.kind === "deny") {
    return c.redirect(prepared.location, 302);
  }
  return issueCodeAndRedirect(c, userId, prepared.app, prepared.params);
};

oauthRoutes.get("/authorize", authorizeGet);
oauthRoutes.post("/authorize", authorizePost);

// ─── token ────────────────────────────────────────────────────

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

const tokenPost = async (
  c: Context<AppEnv>,
  form: Record<string, string>,
) => {
  const auth = await authenticateClient(c, form);
  if (!auth.ok) {
    return oauthError(c, auth.status, auth.error, auth.description);
  }

  const result = await oauthService.processTokenGrant(
    c.env,
    (form.grant_type || "").trim(),
    form,
    auth.app,
  );
  if (!result.ok) {
    const body: Record<string, string> = { error: result.error };
    if (result.description) body.error_description = result.description;
    if (result.status === 401) {
      return c.json(body, result.status, { "WWW-Authenticate": "Bearer" });
    }
    return c.json(body, result.status);
  }
  return c.json(result.body);
};

const tokenRoute = createRoute({
  method: "post",
  path: "/token",
  tags: ["OAuth"],
  summary: "OAuth 2 token endpoint",
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: oauthFormBodySchema,
        },
      },
    },
  },
  responses: {
    200: jsonResponse(oauthTokenSuccessSchema, "Token issued"),
    400: jsonResponse(oauthErrorResponseSchema, "Invalid request"),
    401: jsonResponse(oauthErrorResponseSchema, "Invalid client"),
  },
});

oauthRoutes.openapi(tokenRoute, (c) =>
  tokenPost(c, c.req.valid("form") as Record<string, string>),
);

// ─── DCR ──────────────────────────────────────────────────────

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

const registerPost = async (c: Context<AppEnv>, data: unknown) => {
  const parsed = oauthService.parseDcrMetadata(data);
  if (!parsed.ok) {
    return dcrError(c, parsed.status, parsed.error, parsed.description);
  }

  const created = await oauthService.createDcrClient(
    c.env,
    c.req.url,
    parsed.metadata,
  );
  return c.json(created.body, created.status);
};

const registerGet = async (c: Context<AppEnv>) => {
  const clientId = c.req.param("clientId") ?? "";
  const result = await oauthService.getDcrClient(
    c.env,
    c.req.url,
    clientId,
    c.req.header("Authorization"),
  );
  if (!result.ok) {
    return dcrError(c, result.status, result.error, result.description);
  }
  return c.json(result.body, result.status);
};

const registerPut = async (
  c: Context<AppEnv>,
  clientId: string,
  data: unknown,
) => {
  const parsed = oauthService.parseDcrMetadata(data);
  if (!parsed.ok) {
    return dcrError(c, parsed.status, parsed.error, parsed.description);
  }

  const result = await oauthService.updateDcrClient(
    c.env,
    c.req.url,
    clientId,
    c.req.header("Authorization"),
    parsed.metadata,
  );
  if (!result.ok) {
    return dcrError(c, result.status, result.error, result.description);
  }
  return c.json(result.body, result.status);
};

const registerDelete = async (c: Context<AppEnv>) => {
  const clientId = c.req.param("clientId") ?? "";
  const result = await oauthService.deleteDcrClient(
    c.env,
    clientId,
    c.req.header("Authorization"),
  );
  if (!result.ok) {
    return dcrError(c, result.status, result.error, result.description);
  }
  return c.body(null, 204);
};

const registerPostRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["OAuth"],
  summary: "Dynamic client registration (RFC 7591)",
  request: {
    body: {
      content: { "application/json": { schema: dcrClientMetadataSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(dcrClientResponseSchema, "Client registered"),
    400: jsonResponse(dcrErrorResponseSchema, "Invalid client metadata"),
  },
});

const registerGetRoute = createRoute({
  method: "get",
  path: "/register/{clientId}",
  tags: ["OAuth"],
  summary: "Read dynamic client registration (RFC 7592)",
  request: { params: dcrClientIdParamSchema },
  responses: {
    200: jsonResponse(dcrClientResponseSchema, "Client metadata"),
    401: jsonResponse(dcrErrorResponseSchema, "Invalid registration token"),
  },
});

const registerPutRoute = createRoute({
  method: "put",
  path: "/register/{clientId}",
  tags: ["OAuth"],
  summary: "Update dynamic client registration (RFC 7592)",
  request: {
    params: dcrClientIdParamSchema,
    body: {
      content: { "application/json": { schema: dcrClientMetadataSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(dcrClientResponseSchema, "Client updated"),
    400: jsonResponse(dcrErrorResponseSchema, "Invalid client metadata"),
    401: jsonResponse(dcrErrorResponseSchema, "Invalid registration token"),
  },
});

const registerDeleteRoute = createRoute({
  method: "delete",
  path: "/register/{clientId}",
  tags: ["OAuth"],
  summary: "Delete dynamic client registration (RFC 7592)",
  request: { params: dcrClientIdParamSchema },
  responses: {
    204: { description: "Client deleted" },
    401: jsonResponse(dcrErrorResponseSchema, "Invalid registration token"),
  },
});

oauthRoutes.openapi(registerPostRoute, (c) =>
  registerPost(c, c.req.valid("json")),
);
oauthRoutes.openapi(registerGetRoute, registerGet);
oauthRoutes.openapi(registerPutRoute, (c) =>
  registerPut(c, c.req.valid("param").clientId, c.req.valid("json")),
);
oauthRoutes.openapi(registerDeleteRoute, registerDelete);

// ─── revoke ───────────────────────────────────────────────────

const revokePost = async (
  c: Context<AppEnv>,
  form: Record<string, string>,
) => {
  const auth = await authenticateClient(c, form);
  // RFC 7009: invalid token → still 200; invalid client → 401
  if (!auth.ok) {
    if (auth.error === "invalid_client") {
      return oauthError(c, auth.status, auth.error, auth.description);
    }
    return c.body(null, 200);
  }

  await oauthService.revokeOAuthTokenRequest(c.env, form, auth.app);
  return c.body(null, 200);
};

const revokeRoute = createRoute({
  method: "post",
  path: "/revoke_token",
  tags: ["OAuth"],
  summary: "OAuth 2 token revocation (RFC 7009)",
  request: {
    body: {
      content: {
        "application/x-www-form-urlencoded": {
          schema: oauthFormBodySchema,
        },
      },
    },
  },
  responses: {
    200: { description: "Revoked (or token unknown)" },
    401: jsonResponse(oauthErrorResponseSchema, "Invalid client"),
  },
});

oauthRoutes.openapi(revokeRoute, (c) =>
  revokePost(c, c.req.valid("form") as Record<string, string>),
);
