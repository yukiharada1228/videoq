import {
  MCP_TOOLS,
  callMcpTool,
  McpToolError,
} from "../../lib/mcp-tools";
import type { Bindings } from "../../types/bindings";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "videoq-api";
const SERVER_VERSION = "0.2.0";

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

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

export type McpDispatchCtx = {
  env: Bindings;
  userId: number;
};

export async function dispatchMcp(
  ctx: McpDispatchCtx,
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
          { env: ctx.env, userId: ctx.userId },
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

/**
 * HTTP 層の payload（単体 or batch）を処理し、レスポンス本体を返す。
 * `kind: "accepted"` は JSON-RPC notification（202）。
 */
export async function handleMcpHttpPayload(
  ctx: McpDispatchCtx,
  payload: unknown,
): Promise<
  | { kind: "json"; body: unknown }
  | { kind: "accepted" }
  | { kind: "error"; body: ReturnType<typeof makeError> }
> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        kind: "error",
        body: makeError(null, INVALID_REQUEST, "Empty batch"),
      };
    }
    const responses: Record<string, unknown>[] = [];
    for (const item of payload) {
      const resp = await dispatchMcp(ctx, item);
      if (resp !== null) responses.push(resp);
    }
    if (responses.length === 0) return { kind: "accepted" };
    return { kind: "json", body: responses };
  }

  if (!payload || typeof payload !== "object") {
    return {
      kind: "error",
      body: makeError(
        null,
        INVALID_REQUEST,
        "Request must be a JSON object or array",
      ),
    };
  }

  const result = await dispatchMcp(ctx, payload);
  if (result === null) return { kind: "accepted" };
  return { kind: "json", body: result };
}

export { makeError, INVALID_REQUEST };
