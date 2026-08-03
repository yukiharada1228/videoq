import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  oauthBearerMethod,
  bearerApiKeyMethod,
  apiKeyMethod,
  requireScope,
} from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../shared/openapi";
import { toErrorBody } from "../../shared/errors";
import type { AppEnv } from "../../types/bindings";
import { mcpErrorBodySchema, mcpJsonRpcSchema } from "./schemas";
import {
  handleMcpHttpPayload,
} from "./service";

/**
 * MCP Streamable HTTP（JSON-RPC 2.0）。
 * 認証順: OAuth Bearer → Bearer API キー → X-API-Key/ApiKey。
 */
export const mcpRoutes = createFeatureRouter();

function mcpWwwAuthenticate(c: Context<AppEnv>): string {
  const issuer = (
    c.env.OAUTH_ISSUER_URL || new URL(c.req.url).origin
  ).replace(/\/$/, "");
  const meta = `${issuer}/.well-known/oauth-protected-resource/api/mcp`;
  return `Bearer realm="api",resource_metadata="${meta}"`;
}

const mcpAuth = createMiddleware<AppEnv>(async (c, next) => {
  for (const method of [oauthBearerMethod, bearerApiKeyMethod, apiKeyMethod]) {
    const r = await method(c);
    if (r.kind === "ok") {
      c.set("userId", r.userId);
      c.set("authVia", r.via);
      if (r.accessLevel) c.set("apiKeyAccessLevel", r.accessLevel);
      return next();
    }
    if (r.kind === "invalid") {
      return c.json(toErrorBody("UNAUTHORIZED", r.message), 401, {
        "WWW-Authenticate": mcpWwwAuthenticate(c),
      });
    }
  }
  return c.json(
    toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
    401,
    { "WWW-Authenticate": mcpWwwAuthenticate(c) },
  );
});

const mcpGuards = [mcpAuth, requireScope("write")] as const;

const postMcpRoute = createRoute({
  method: "post",
  path: "/api/mcp",
  tags: ["MCP"],
  summary: "MCP JSON-RPC (Streamable HTTP)",
  description:
    "Body is a JSON-RPC 2.0 object or batch array.",
  middleware: [...mcpGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: mcpJsonRpcSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(z.unknown(), "JSON-RPC response"),
    202: { description: "Notification accepted" },
    400: jsonResponse(z.record(z.string(), z.unknown()), "Invalid JSON-RPC"),
    401: errorResponse("Unauthorized"),
  },
});

mcpRoutes.openapi(postMcpRoute, async (c) => {
  const result = await handleMcpHttpPayload(
    { env: c.env, userId: c.get("userId")! },
    c.req.valid("json"),
  );
  if (result.kind === "accepted") return c.body(null, 202);
  if (result.kind === "error") return c.json(result.body, 400);
  return c.json(result.body);
});

const getMcpRoute = createRoute({
  method: "get",
  path: "/api/mcp",
  tags: ["MCP"],
  summary: "MCP GET (SSE not implemented)",
  middleware: [...mcpGuards] as const,
  responses: {
    405: jsonResponse(mcpErrorBodySchema, "Method not allowed"),
  },
});

mcpRoutes.openapi(getMcpRoute, (c) =>
  c.json({ error: "GET is not supported on this endpoint" }, 405),
);

const deleteMcpRoute = createRoute({
  method: "delete",
  path: "/api/mcp",
  tags: ["MCP"],
  summary: "MCP session end (stateless 204)",
  middleware: [...mcpGuards] as const,
  responses: {
    204: { description: "No content" },
    401: errorResponse("Unauthorized"),
  },
});

mcpRoutes.openapi(deleteMcpRoute, (c) => c.body(null, 204));
