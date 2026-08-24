import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  MCP_TOOL_DESCRIPTIONS,
  McpToolError,
  callMcpTool,
  mcpToolSchemas,
  type McpToolCallContext,
  type McpToolName,
} from "../../lib/mcp-tools";

const SERVER_NAME = "videoq-api";
const SERVER_VERSION = "0.2.0";

function toolResult(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structured, null, 2),
      },
    ],
    structuredContent: structured,
    isError: false,
  };
}

function toolError(e: McpToolError): CallToolResult {
  const result: CallToolResult = {
    content: [{ type: "text", text: e.message }],
    isError: true,
  };
  if (
    e.data !== undefined &&
    e.data !== null &&
    typeof e.data === "object" &&
    !Array.isArray(e.data)
  ) {
    result.structuredContent = e.data as Record<string, unknown>;
  }
  return result;
}

async function runTool(
  name: McpToolName,
  args: Record<string, unknown>,
  ctx: McpToolCallContext,
): Promise<CallToolResult> {
  try {
    return toolResult(await callMcpTool(name, args, ctx));
  } catch (e) {
    if (e instanceof McpToolError) return toolError(e);
    throw e;
  }
}

/** リクエストスコープの VideoQ MCP サーバーを組み立てる。 */
export function createVideoqMcpServer(ctx: McpToolCallContext): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_videos",
    {
      description: MCP_TOOL_DESCRIPTIONS.list_videos,
      inputSchema: mcpToolSchemas.list_videos,
    },
    async (args) => runTool("list_videos", args, ctx),
  );

  server.registerTool(
    "get_video",
    {
      description: MCP_TOOL_DESCRIPTIONS.get_video,
      inputSchema: mcpToolSchemas.get_video,
    },
    async (args) => runTool("get_video", args, ctx),
  );

  server.registerTool(
    "list_courses",
    {
      description: MCP_TOOL_DESCRIPTIONS.list_courses,
      inputSchema: mcpToolSchemas.list_courses,
    },
    async (args) => runTool("list_courses", args, ctx),
  );

  server.registerTool(
    "get_course",
    {
      description: MCP_TOOL_DESCRIPTIONS.get_course,
      inputSchema: mcpToolSchemas.get_course,
    },
    async (args) => runTool("get_course", args, ctx),
  );

  server.registerTool(
    "list_tags",
    {
      description: MCP_TOOL_DESCRIPTIONS.list_tags,
      inputSchema: mcpToolSchemas.list_tags,
    },
    async (args) => runTool("list_tags", args, ctx),
  );

  server.registerTool(
    "get_chat_history",
    {
      description: MCP_TOOL_DESCRIPTIONS.get_chat_history,
      inputSchema: mcpToolSchemas.get_chat_history,
    },
    async (args) => runTool("get_chat_history", args, ctx),
  );

  server.registerTool(
    "get_chat_analytics",
    {
      description: MCP_TOOL_DESCRIPTIONS.get_chat_analytics,
      inputSchema: mcpToolSchemas.get_chat_analytics,
    },
    async (args) => runTool("get_chat_analytics", args, ctx),
  );

  server.registerTool(
    "get_evaluation_summary",
    {
      description: MCP_TOOL_DESCRIPTIONS.get_evaluation_summary,
      inputSchema: mcpToolSchemas.get_evaluation_summary,
    },
    async (args) => runTool("get_evaluation_summary", args, ctx),
  );

  server.registerTool(
    "list_evaluation_logs",
    {
      description: MCP_TOOL_DESCRIPTIONS.list_evaluation_logs,
      inputSchema: mcpToolSchemas.list_evaluation_logs,
    },
    async (args) => runTool("list_evaluation_logs", args, ctx),
  );

  return server;
}
