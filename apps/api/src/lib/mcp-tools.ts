import type { Bindings } from "../types/bindings";
import { listVideosPage, getVideoDetail } from "../repositories/video-repository";
import { listGroupsPage, getGroupDetail } from "../repositories/group-repository";
import { listTagsPage } from "../repositories/tag-repository";
import {
  getGroupChatHistory,
  getGroupChatAnalytics,
} from "../repositories/chat-repository";
import {
  getEvaluationSummary,
  listEvaluationLogs,
} from "../repositories/evaluation-repository";

/** MCP tool レベルのエラー（`isError: true` としてクライアントへ返す）。 */
export class McpToolError extends Error {
  data: unknown;
  constructor(message: string, data: unknown = undefined) {
    super(message);
    this.name = "McpToolError";
    this.data = data;
  }
}

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type Json = Record<string, unknown>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const PAGINATION_PROPS: Json = {
  limit: {
    type: "integer",
    minimum: 1,
    maximum: MAX_LIMIT,
    description: `Max items to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
  },
  offset: {
    type: "integer",
    minimum: 0,
    description: "Number of items to skip.",
  },
};

function normalizePagination(arguments_: Json): { limit: number; offset: number } {
  const rawLimit = arguments_.limit;
  let limit = rawLimit === undefined || rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isFinite(limit)) limit = DEFAULT_LIMIT;
  limit = Math.max(1, Math.min(Math.trunc(limit), MAX_LIMIT));
  let offset = Number(arguments_.offset ?? 0);
  if (!Number.isFinite(offset)) offset = 0;
  offset = Math.max(0, Math.trunc(offset));
  return { limit, offset };
}

function envelope(items: unknown[], count: number, itemsKey: string): Json {
  return {
    meta: { total: count, limit: items.length, offset: 0 },
    [itemsKey]: items,
    data: items,
  };
}

/** VideoQ MCP エンドポイントのツール定義とハンドラ。 */
export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "list_videos",
    description:
      "List your videos. Supports keyword, status, ordering, tag filters, " +
      "and limit/offset pagination. Returns count/next/previous/videos.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "processing", "indexing", "completed", "error"],
        },
        ordering: {
          type: "string",
          enum: [
            "uploaded_at_desc",
            "uploaded_at_asc",
            "title_asc",
            "title_desc",
          ],
        },
        tags: { type: "array", items: { type: "integer" } },
        ...PAGINATION_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_video",
    description: "Get a video's detail by ID, including transcript when available.",
    inputSchema: {
      type: "object",
      properties: { video_id: { type: "integer" } },
      required: ["video_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_groups",
    description: "List your video groups. Supports limit/offset pagination.",
    inputSchema: {
      type: "object",
      properties: { ...PAGINATION_PROPS },
      additionalProperties: false,
    },
  },
  {
    name: "get_group",
    description: "Get a video group's detail and its member videos.",
    inputSchema: {
      type: "object",
      properties: { group_id: { type: "integer" } },
      required: ["group_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tags",
    description: "List your tags. Supports limit/offset pagination.",
    inputSchema: {
      type: "object",
      properties: { ...PAGINATION_PROPS },
      additionalProperties: false,
    },
  },
  {
    name: "get_chat_history",
    description:
      "Get chat history for a group. Each entry includes role, content, " +
      "feedback (good/bad/null), citations, and timestamps. " +
      "Supports limit/offset pagination.",
    inputSchema: {
      type: "object",
      properties: { group_id: { type: "integer" }, ...PAGINATION_PROPS },
      required: ["group_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_chat_analytics",
    description:
      "Get aggregated chat analytics for a group: total question count, " +
      "date range, daily time series, and feedback breakdown (good/bad/none).",
    inputSchema: {
      type: "object",
      properties: { group_id: { type: "integer" } },
      required: ["group_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_evaluation_summary",
    description:
      "Get averaged RAGAS evaluation scores for a group: evaluated_count, " +
      "avg_faithfulness, avg_answer_relevancy, avg_context_precision.",
    inputSchema: {
      type: "object",
      properties: { group_id: { type: "integer" } },
      required: ["group_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_evaluation_logs",
    description:
      "List per-ChatLog RAGAS evaluation results for a group. Each entry " +
      "has chat_log_id, status, faithfulness, answer_relevancy, " +
      "context_precision, error_message, evaluated_at. " +
      "Supports limit/offset pagination.",
    inputSchema: {
      type: "object",
      properties: { group_id: { type: "integer" }, ...PAGINATION_PROPS },
      required: ["group_id"],
      additionalProperties: false,
    },
  },
];

export type McpToolCallContext = {
  env: Bindings;
  userId: number;
};

/** ツール呼び出し（未知ツール / ドメインエラーは McpToolError）。 */
export async function callMcpTool(
  name: string,
  arguments_: Json,
  ctx: McpToolCallContext,
): Promise<Json> {
  switch (name) {
    case "list_videos": {
      const { limit, offset } = normalizePagination(arguments_);
      const tags = (arguments_.tags as unknown[]) || [];
      const tagIds = tags.map((t) => Number(t)).filter((n) => Number.isInteger(n));
      const page = await listVideosPage(
        ctx.env,
        ctx.userId,
        {
          keyword: String(arguments_.q ?? "").trim(),
          statusFilter: String(arguments_.status ?? "").trim(),
          sortKey: String(arguments_.ordering ?? "").trim(),
          tagIds: tagIds.length > 0 ? tagIds : null,
        },
        limit,
        offset,
      );
      return envelope(page.results, page.count, "videos");
    }
    case "get_video": {
      const video = await getVideoDetail(
        ctx.env,
        Number(arguments_.video_id),
        ctx.userId,
      );
      if (!video) throw new McpToolError("Video not found", { status: 404 });
      return { video };
    }
    case "list_groups": {
      const { limit, offset } = normalizePagination(arguments_);
      const page = await listGroupsPage(ctx.env, ctx.userId, limit, offset);
      return envelope(page.results, page.count, "groups");
    }
    case "get_group": {
      const group = await getGroupDetail(
        ctx.env,
        Number(arguments_.group_id),
        ctx.userId,
      );
      if (!group) throw new McpToolError("Group not found", { status: 404 });
      return { group };
    }
    case "list_tags": {
      const { limit, offset } = normalizePagination(arguments_);
      const page = await listTagsPage(ctx.env, ctx.userId, limit, offset);
      return envelope(page.results, page.count, "tags");
    }
    case "get_chat_history": {
      const { limit, offset } = normalizePagination(arguments_);
      const res = await getGroupChatHistory(
        ctx.env,
        Number(arguments_.group_id),
        ctx.userId,
        limit,
        offset,
      );
      if ("notFound" in res) {
        throw new McpToolError("Group not found", { status: 404 });
      }
      return envelope(res.results, res.count, "history");
    }
    case "get_chat_analytics": {
      const res = await getGroupChatAnalytics(
        ctx.env,
        Number(arguments_.group_id),
        ctx.userId,
      );
      if ("notFound" in res) {
        throw new McpToolError("Group not found", { status: 404 });
      }
      return { analytics: res };
    }
    case "get_evaluation_summary": {
      const res = await getEvaluationSummary(
        ctx.env,
        Number(arguments_.group_id),
        ctx.userId,
      );
      if ("notFound" in res) {
        throw new McpToolError("Group not found", { status: 404 });
      }
      return { summary: res };
    }
    case "list_evaluation_logs": {
      const { limit, offset } = normalizePagination(arguments_);
      const res = await listEvaluationLogs(
        ctx.env,
        Number(arguments_.group_id),
        ctx.userId,
        limit,
        offset,
      );
      if ("notFound" in res) {
        throw new McpToolError("Group not found", { status: 404 });
      }
      return envelope(res.results, res.count, "logs");
    }
    default:
      throw new McpToolError(`Unknown tool: ${name}`);
  }
}
