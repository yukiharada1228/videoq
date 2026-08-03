import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  oauthBearerMethod,
  bearerApiKeyMethod,
  apiKeyMethod,
  requireScope,
} from "../middleware/auth";
import {
  MCP_TOOLS,
  callMcpTool,
  McpToolError,
} from "../lib/mcp-tools";
import type { AppEnv } from "../types/bindings";

/**
 * MCP Streamable HTTP（Django `MCPEndpointView`）。
 *   POST   /api/mcp(/)  ── JSON-RPC 2.0（initialize / ping / tools/list / tools/call）
 *   GET    /api/mcp(/)  ── 405（SSE 未実装）
 *   DELETE /api/mcp(/)  ── 204（stateless）
 *
 * 認証順: OAuth Bearer → Bearer API キー → X-API-Key/ApiKey。
 * 401 には RFC 9728 `WWW-Authenticate: Bearer realm="api",resource_metadata="..."`。
 *
 * OAuth AS（authorize / token / DCR / well-known）は `routes/oauth.ts`。
 */
export const mcpRoutes = new Hono<AppEnv>();

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "videoq-api";
const SERVER_VERSION = "0.2.0";

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

/** Django `MCPOAuth2Authentication.get_resource_metadata_url` 相当。 */
function mcpWwwAuthenticate(c: Context<AppEnv>): string {
  const issuer = (
    c.env.OAUTH2_PROVIDER_ISSUER_URL || new URL(c.req.url).origin
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
      return c.json(
        { detail: r.message },
        401,
        { "WWW-Authenticate": mcpWwwAuthenticate(c) },
      );
    }
  }
  return c.json(
    { detail: "Authentication credentials were not provided." },
    401,
    { "WWW-Authenticate": mcpWwwAuthenticate(c) },
  );
});

// POST は Django 同様 required_scope=write（read_only キーは 403）。
const mcpGuards = [mcpAuth, requireScope("write")] as const;

const makeResult = (id: unknown, result: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  result,
});

const makeError = (
  id: unknown,
  code: number,
  message: string,
  data?: unknown,
) => {
  const error: { code: number; message: string; data?: unknown } = {
    code,
    message,
  };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0" as const, id, error };
};

async function dispatch(
  c: Context<AppEnv>,
  message: unknown,
): Promise<Record<string, unknown> | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return makeError(null, INVALID_REQUEST, "Request must be a JSON object");
  }

  const msg = message as Record<string, unknown>;
  const requestId = msg.id;
  const isNotification = !("id" in msg);
  const method = msg.method;
  if (typeof method !== "string") {
    if (isNotification) return null;
    return makeError(requestId, INVALID_REQUEST, "Missing or invalid 'method'");
  }

  const params =
    msg.params && typeof msg.params === "object" && !Array.isArray(msg.params)
      ? (msg.params as Record<string, unknown>)
      : {};

  try {
    if (method === "initialize") {
      if (isNotification) return null;
      const requested =
        typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : null;
      return makeResult(requestId, {
        protocolVersion: requested || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    }

    if (method === "notifications/initialized" || method === "initialized") {
      return null;
    }

    if (method === "ping") {
      if (isNotification) return null;
      return makeResult(requestId, {});
    }

    if (method === "tools/list") {
      if (isNotification) return null;
      return makeResult(requestId, {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }

    if (method === "tools/call") {
      if (!msg.params || typeof msg.params !== "object" || Array.isArray(msg.params)) {
        return makeError(requestId, INVALID_PARAMS, "params must be an object");
      }
      const toolName = params.name;
      if (typeof toolName !== "string") {
        return makeError(requestId, INVALID_PARAMS, "'name' must be a string");
      }
      const arguments_ = params.arguments ?? {};
      if (
        arguments_ === null ||
        typeof arguments_ !== "object" ||
        Array.isArray(arguments_)
      ) {
        return makeError(
          requestId,
          INVALID_PARAMS,
          "'arguments' must be an object",
        );
      }

      try {
        const structured = await callMcpTool(
          toolName,
          arguments_ as Record<string, unknown>,
          {
            env: c.env,
            userId: c.get("userId")!,
          },
        );
        return makeResult(requestId, {
          content: [
            {
              type: "text",
              text: JSON.stringify(structured, null, 2),
            },
          ],
          structuredContent: structured,
          isError: false,
        });
      } catch (e) {
        if (e instanceof McpToolError) {
          const toolError: Record<string, unknown> = {
            content: [{ type: "text", text: e.message }],
            isError: true,
          };
          if (e.data !== undefined) toolError.structuredContent = e.data;
          return makeResult(requestId, toolError);
        }
        throw e;
      }
    }

    if (isNotification) return null;
    return makeError(requestId, METHOD_NOT_FOUND, `Method not found: ${method}`);
  } catch {
    if (isNotification) return null;
    return makeError(
      requestId,
      INTERNAL_ERROR,
      "Internal error processing request",
    );
  }
}

const postMcp = async (c: Context<AppEnv>) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(
      makeError(null, INVALID_REQUEST, "Request must be a JSON object or array"),
      400,
    );
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return c.json(makeError(null, INVALID_REQUEST, "Empty batch"), 400);
    }
    const responses: Record<string, unknown>[] = [];
    for (const item of payload) {
      const resp = await dispatch(c, item);
      if (resp !== null) responses.push(resp);
    }
    if (responses.length === 0) return c.body(null, 202);
    return c.json(responses);
  }

  if (!payload || typeof payload !== "object") {
    return c.json(
      makeError(null, INVALID_REQUEST, "Request must be a JSON object or array"),
      400,
    );
  }

  const result = await dispatch(c, payload);
  if (result === null) return c.body(null, 202);
  return c.json(result);
};

const getMcp = (c: Context<AppEnv>) =>
  c.json({ error: "GET is not supported on this endpoint" }, 405);

const deleteMcp = (c: Context<AppEnv>) => c.body(null, 204);

// Claude.ai は trailing slash 無しの POST を 301 されると失敗するため両方定義。
mcpRoutes.post("/api/mcp", ...mcpGuards, postMcp);
mcpRoutes.post("/api/mcp/", ...mcpGuards, postMcp);
mcpRoutes.get("/api/mcp", ...mcpGuards, getMcp);
mcpRoutes.get("/api/mcp/", ...mcpGuards, getMcp);
mcpRoutes.delete("/api/mcp", ...mcpGuards, deleteMcp);
mcpRoutes.delete("/api/mcp/", ...mcpGuards, deleteMcp);
