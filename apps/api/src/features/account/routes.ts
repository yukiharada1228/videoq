import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../shared/openapi";
import { requireAuth, sessionMethod } from "../../middleware/auth";
import { apiNotFound } from "../../shared/errors";
import * as userRepository from "../../repositories/user-repository";
import { encryptUserSecret } from "../../lib/secret-encryption";
import { withDb } from "../../db/pool";
import { createAuth } from "../../lib/auth";

/**
 * App-owned account endpoints (profile, SearchAPI key, connected apps).
 * Authentication is Better Auth session cookies — not a custom auth protocol.
 */
export const accountRoutes = createFeatureRouter();

const sessionOnly = requireAuth(sessionMethod);

const connectedAppSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  client_name: z.string(),
  scope: z.string(),
  issued_at: z.string(),
  expires_at: z.string().nullable(),
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  summary: "Current user profile (app fields)",
  middleware: [sessionOnly] as const,
  responses: {
    200: jsonResponse(z.record(z.string(), z.unknown())),
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(meRoute, async (c) => {
  const user = await userRepository.getCurrentUser(c.env, c.var.userId!);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const searchApiStatusRoute = createRoute({
  method: "get",
  path: "/searchapi-key",
  summary: "SearchAPI key presence",
  middleware: [sessionOnly] as const,
  responses: {
    200: jsonResponse(z.object({ has_api_key: z.boolean() })),
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(searchApiStatusRoute, async (c) => {
  const has = await userRepository.getSearchApiKeyStatus(c.env, c.var.userId!);
  if (has === null) throw apiNotFound("User not found");
  return c.json({ has_api_key: has }, 200);
});

const searchApiPutRoute = createRoute({
  method: "put",
  path: "/searchapi-key",
  summary: "Set SearchAPI key",
  middleware: [sessionOnly] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ api_key: z.string().min(1) }),
        },
      },
    },
  },
  responses: {
    204: { description: "Updated" },
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(searchApiPutRoute, async (c) => {
  const { api_key } = c.req.valid("json");
  const encrypted = await encryptUserSecret(c.env, api_key);
  const ok = await userRepository.setSearchApiKey(c.env, c.var.userId!, encrypted);
  if (!ok) throw apiNotFound("User not found");
  return c.body(null, 204);
});

const searchApiDeleteRoute = createRoute({
  method: "delete",
  path: "/searchapi-key",
  summary: "Delete SearchAPI key",
  middleware: [sessionOnly] as const,
  responses: {
    204: { description: "Deleted" },
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(searchApiDeleteRoute, async (c) => {
  const ok = await userRepository.deleteSearchApiKey(c.env, c.var.userId!);
  if (!ok) throw apiNotFound("User not found");
  return c.body(null, 204);
});

const connectedAppsRoute = createRoute({
  method: "get",
  path: "/connected-apps",
  summary: "Connected OAuth apps for current user",
  middleware: [sessionOnly] as const,
  responses: {
    200: jsonResponse(z.array(connectedAppSchema)),
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(connectedAppsRoute, async (c) => {
  return withDb(c.env, async (db) => {
    const auth = createAuth(c.env, db);
    const consents = await auth.api.getOAuthConsents({
      headers: c.req.raw.headers,
    });
    const apps = (consents ?? []).map((consent) => {
      const scopes = Array.isArray(consent.scopes) ? consent.scopes.join(" ") : "";
      const createdAt =
        consent.createdAt instanceof Date
          ? consent.createdAt.toISOString()
          : String(consent.createdAt ?? new Date().toISOString());
      return {
        id: String(consent.id),
        client_id: String(consent.clientId),
        client_name: String(consent.clientId),
        scope: scopes,
        issued_at: createdAt,
        expires_at: null as string | null,
      };
    });
    return c.json(apps, 200);
  });
});

const revokeConnectedAppRoute = createRoute({
  method: "delete",
  path: "/connected-apps/{id}",
  summary: "Revoke OAuth consent for a connected app",
  middleware: [sessionOnly] as const,
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    204: { description: "Revoked" },
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(revokeConnectedAppRoute, async (c) => {
  const { id } = c.req.valid("param");
  await withDb(c.env, async (db) => {
    const auth = createAuth(c.env, db);
    await auth.api.deleteOAuthConsent({
      headers: c.req.raw.headers,
      body: { id },
    });
  });
  return c.body(null, 204);
});
