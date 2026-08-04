import { z } from "zod";
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

type Json = Record<string, unknown>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const intId = z.coerce.number().int();

const paginationShape = {
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max items to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of items to skip."),
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

function envelope(
  items: unknown[],
  count: number,
  itemsKey: string,
  limit: number,
  offset: number,
): Json {
  return {
    meta: { total: count, limit, offset },
    [itemsKey]: items,
    data: items,
  };
}

export type McpToolCallContext = {
  env: Bindings;
  userId: number;
};

/** Zod input shapes for `McpServer.registerTool`. */
export const mcpToolSchemas = {
  list_videos: {
    q: z.string().optional(),
    status: z
      .enum(["pending", "processing", "indexing", "completed", "error"])
      .optional(),
    ordering: z
      .enum([
        "uploaded_at_desc",
        "uploaded_at_asc",
        "title_asc",
        "title_desc",
      ])
      .optional(),
    tags: z.array(intId).optional(),
    ...paginationShape,
  },
  get_video: {
    video_id: intId,
  },
  list_groups: {
    ...paginationShape,
  },
  get_group: {
    group_id: intId,
  },
  list_tags: {
    ...paginationShape,
  },
  get_chat_history: {
    group_id: intId,
    ...paginationShape,
  },
  get_chat_analytics: {
    group_id: intId,
  },
  get_evaluation_summary: {
    group_id: intId,
  },
  list_evaluation_logs: {
    group_id: intId,
    ...paginationShape,
  },
} as const;

export const MCP_TOOL_DESCRIPTIONS = {
  list_videos:
    "List your videos. Supports keyword, status, ordering, tag filters, " +
    "and limit/offset pagination. Returns count/next/previous/videos.",
  get_video: "Get a video's detail by ID, including transcript when available.",
  list_groups: "List your video groups. Supports limit/offset pagination.",
  get_group: "Get a video group's detail and its member videos.",
  list_tags: "List your tags. Supports limit/offset pagination.",
  get_chat_history:
    "Get chat history for a group. Each entry includes role, content, " +
    "feedback (good/bad/null), citations, and timestamps. " +
    "Supports limit/offset pagination.",
  get_chat_analytics:
    "Get aggregated chat analytics for a group: total question count, " +
    "date range, daily time series, and feedback breakdown (good/bad/none).",
  get_evaluation_summary:
    "Get averaged RAGAS evaluation scores for a group: evaluated_count, " +
    "avg_faithfulness, avg_answer_relevancy, avg_context_precision.",
  list_evaluation_logs:
    "List per-ChatLog RAGAS evaluation results for a group. Each entry " +
    "has chat_log_id, status, faithfulness, answer_relevancy, " +
    "context_precision, error_message, evaluated_at. " +
    "Supports limit/offset pagination.",
} as const;

export type McpToolName = keyof typeof mcpToolSchemas;

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
      return envelope(page.results, page.count, "videos", limit, offset);
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
      return envelope(page.results, page.count, "groups", limit, offset);
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
      return envelope(page.results, page.count, "tags", limit, offset);
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
      return envelope(res.results, res.count, "history", limit, offset);
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
      return envelope(res.results, res.count, "logs", limit, offset);
    }
    default:
      throw new McpToolError(`Unknown tool: ${name}`);
  }
}
