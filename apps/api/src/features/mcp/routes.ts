import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { StreamableHTTPTransport } from "@hono/mcp";
import {
  oauthBearerMethod,
  bearerApiKeyMethod,
  apiKeyMethod,
  requireScope,
} from "../../middleware/auth";
import { createFeatureRouter } from "../../shared/openapi";
import { toErrorBody } from "../../shared/errors";
import type { AppEnv } from "../../types/bindings";
import { createVideoqMcpServer } from "./server";

/**
 * MCP Streamable HTTP（@hono/mcp）。
 * 認証順: OAuth Bearer → Bearer API キー → X-API-Key/ApiKey。
 * analytics-only のため API キースコープは read。
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

mcpRoutes.use("*", mcpAuth, requireScope("read"));

mcpRoutes.all("/", async (c) => {
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createVideoqMcpServer({
    env: c.env,
    userId: c.var.userId!,
  });
  await server.connect(transport);
  return transport.handleRequest(c);
});
