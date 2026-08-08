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

/**
 * App-owned account endpoints (profile, SearchAPI key).
 * Authentication is Better Auth session cookies — not a custom auth protocol.
 */
export const accountRoutes = createFeatureRouter();

const sessionOnly = requireAuth(sessionMethod);

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

/** List OAuth consents / connected apps via Better Auth provider APIs when available. */
const connectedAppsRoute = createRoute({
  method: "get",
  path: "/connected-apps",
  summary: "Connected OAuth apps for current user",
  middleware: [sessionOnly] as const,
  responses: {
    200: jsonResponse(
      z.array(
        z.object({
          id: z.string(),
          client_id: z.string(),
          client_name: z.string(),
          scope: z.string(),
          issued_at: z.string(),
          expires_at: z.string().nullable(),
        }),
      ),
    ),
    401: errorResponse("Unauthorized"),
  },
});

accountRoutes.openapi(connectedAppsRoute, async (c) => {
  // Consent listing is served by Better Auth oauth-provider client endpoints;
  // keep a stable empty list until FE switches fully to authClient.
  return c.json([], 200);
});
