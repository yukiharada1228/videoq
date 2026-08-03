import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { streamSSE } from "hono/streaming";
import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  bearerApiKeyMethod,
  jwtMethod,
} from "../../middleware/auth";
import { ApiError, toErrorBody } from "../../shared/errors";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../shared/openapi";
import {
  createListResponseSchema,
  listResponse,
  parseLimitOffset,
} from "../../shared/pagination";
import {
  clientIp,
  enforceThrottles,
  throttledResponse,
} from "../../lib/rate-limit";
import type { AppEnv } from "../../types/bindings";
import {
  chatAnalyticsSchema,
  chatGroupParamSchema,
  chatHistoryQuerySchema,
  chatLogItemSchema,
  chatLogParamSchema,
  chatMessageBodySchema,
  feedbackBodySchema,
  feedbackResponseSchema,
  openAiCompletionBodySchema,
  openAiCompletionResponseSchema,
} from "./schemas";
import * as chatService from "./service";
import * as messageService from "./message-service";

/**
 * チャット系。全エンドポイント OpenAPI + Zod。
 * body 検証は createRoute（defaultHook）に一本化。
 */
export const chatRoutes = createFeatureRouter();

const chatAuth = requireAuth(apiKeyMethod, jwtMethod);
const groupNotFound = () =>
  new ApiError(404, "VALIDATION_ERROR", "Group not found.");

const historyRoute = createRoute({
  method: "get",
  path: "/api/chat/groups/{groupId}/history",
  tags: ["Chat"],
  summary: "Chat history (or CSV download)",
  middleware: [chatAuth] as const,
  request: {
    params: chatGroupParamSchema,
    query: chatHistoryQuerySchema,
  },
  responses: {
    200: {
      description: "Chat history or RFC 4180 CSV export",
      content: {
        "application/json": {
          schema: createListResponseSchema(chatLogItemSchema),
        },
        "text/csv": { schema: z.string() },
      },
    },
    404: errorResponse("Not found"),
  },
});

chatRoutes.openapi(historyRoute, async (c) => {
  const userId = c.get("userId")!;
  const { groupId } = c.req.valid("param");
  const query = c.req.valid("query");

  if (query.download === "csv") {
    const res = await chatService.exportHistoryCsv(c.env, groupId, userId);
    if ("notFound" in res) throw groupNotFound();
    return c.body(res.csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${res.filename}"`,
    });
  }

  const { limit, offset } = parseLimitOffset(c);
  const res = await chatService.historyForGroup(
    c.env,
    groupId,
    userId,
    limit,
    offset,
  );
  if ("notFound" in res) throw groupNotFound();
  return c.json(
    listResponse(res.results, { total: res.count, limit, offset }),
    200,
  );
});

const resetGuards = [chatAuth, requireScope()] as const;

const resetHistoryRoute = createRoute({
  method: "delete",
  path: "/api/chat/groups/{groupId}/history",
  tags: ["Chat"],
  summary: "Reset chat history",
  middleware: [...resetGuards] as const,
  request: { params: chatGroupParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

chatRoutes.openapi(resetHistoryRoute, async (c) => {
  const { groupId } = c.req.valid("param");
  const res = await chatService.resetHistory(c.env, groupId, c.get("userId")!);
  if ("notFound" in res) throw groupNotFound();
  return c.body(null, 204);
});

const analyticsRoute = createRoute({
  method: "get",
  path: "/api/chat/groups/{groupId}/analytics",
  tags: ["Chat"],
  summary: "Chat analytics",
  middleware: [chatAuth] as const,
  request: { params: chatGroupParamSchema },
  responses: {
    200: jsonResponse(chatAnalyticsSchema),
    404: errorResponse("Not found"),
  },
});

chatRoutes.openapi(analyticsRoute, async (c) => {
  const { groupId } = c.req.valid("param");
  const res = await chatService.analyticsForGroup(
    c.env,
    groupId,
    c.get("userId")!,
  );
  if ("notFound" in res) throw groupNotFound();
  return c.json(res, 200);
});

// 認証済み、または share_slug が解決できたリクエストを許可する。
const feedbackAuth = createMiddleware<AppEnv>(async (c, next) => {
  for (const m of [apiKeyMethod, jwtMethod]) {
    const r = await m(c);
    if (r.kind === "ok") {
      c.set("userId", r.userId);
      c.set("authVia", r.via);
      if (r.accessLevel) c.set("apiKeyAccessLevel", r.accessLevel);
      return next();
    }
    if (r.kind === "invalid") return c.json(toErrorBody("UNAUTHORIZED", r.message), 401);
  }
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  if (shareSlug && (await chatService.shareSlugExists(c.env, shareSlug))) {
    c.set("authVia", "share");
    return next();
  }
  return c.json(
    toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
    401,
  );
});

const feedbackGuards = [feedbackAuth, requireScope("chat_write")] as const;

const feedbackRoute = createRoute({
  method: "patch",
  path: "/api/chat/logs/{logId}/feedback",
  tags: ["Chat"],
  summary: "Set chat log feedback",
  middleware: [...feedbackGuards] as const,
  request: {
    params: chatLogParamSchema,
    body: {
      content: { "application/json": { schema: feedbackBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(feedbackResponseSchema),
    400: errorResponse("Bad request"),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
  },
});

chatRoutes.openapi(feedbackRoute, async (c) => {
  const { logId } = c.req.valid("param");
  const body = c.req.valid("json");
  let feedback = body.feedback ?? null;
  if (feedback === "") feedback = null;
  if (feedback !== null && feedback !== "good" && feedback !== "bad") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "feedback must be 'good', 'bad', or null (unspecified)",
    );
  }

  const res = await chatService.submitFeedback(
    c.env,
    logId,
    feedback as "good" | "bad" | null,
    {
      userId: c.get("userId"),
      shareSlug: c.req.query("share_slug") || c.req.query("share_token"),
    },
  );
  if ("notFound" in res) {
    throw new ApiError(404, "VALIDATION_ERROR", res.notFound ?? "Not found");
  }
  if ("forbidden" in res) {
    throw new ApiError(403, "VALIDATION_ERROR", res.forbidden ?? "Forbidden");
  }
  return c.json(
    { chat_log_id: res.chat_log_id, feedback: res.feedback },
    200,
  );
});

// --- 書き込み: チャット送信（ChatView / StreamChatView）---
//
// チャット送信は次の順序で処理する:
//   前提条件 → group 解決 → owner 解決 → AI 回答上限 →
//   mode=qa: RAG / mode=study: PlogGuidedChatGateway → ChatLog → 使用量記録。
// throttle: AuthenticatedChatThrottle(300/h) + ShareTokenIPThrottle(100/h)。

/** AuthenticatedChatThrottle + ShareTokenIPThrottle（認証後・view 前）。 */
const chatThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  const denied = await enforceThrottles(c.env, [
    {
      scope: "chat_authenticated",
      ident: c.get("userId") != null ? String(c.get("userId")) : null,
    },
    {
      scope: "chat_share_token_ip",
      ident: shareSlug ? clientIp(c) : null,
    },
  ]);
  if (denied) return throttledResponse(c, denied);
  await next();
});

const shareSlugOf = (c: Context<AppEnv>) =>
  c.req.query("share_slug") ?? c.req.query("share_token") ?? null;

const sendGuards = [
  feedbackAuth,
  chatThrottle,
  requireScope("chat_write"),
] as const;

const sendMessageRoute = createRoute({
  method: "post",
  path: "/api/chat/messages",
  tags: ["Chat"],
  summary: "Send chat message (RAG / study)",
  middleware: [...sendGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: chatMessageBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(z.record(z.string(), z.unknown())),
    400: errorResponse("Bad request"),
  },
});
chatRoutes.openapi(sendMessageRoute, async (c) => {
  const res = await messageService.sendChatMessage(c.env, {
    userId: c.get("userId") ?? null,
    body: c.req.valid("json"),
    shareSlug: shareSlugOf(c),
    locale: messageService.requestLocaleFromHeader(c.req.header("Accept-Language")),
  });
  return c.json(res.body, res.status as Parameters<typeof c.json>[1]);
});

const streamMessageRoute = createRoute({
  method: "post",
  path: "/api/chat/messages/stream",
  tags: ["Chat"],
  summary: "Stream chat message (SSE)",
  middleware: [...sendGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: chatMessageBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Server-sent chat events",
      content: { "text/event-stream": { schema: z.string() } },
    },
    400: errorResponse("Bad request"),
  },
});
chatRoutes.openapi(streamMessageRoute, async (c) => {
  const res = await messageService.streamChatMessage(c.env, {
    userId: c.get("userId") ?? null,
    body: c.req.valid("json"),
    shareSlug: shareSlugOf(c),
    locale: messageService.requestLocaleFromHeader(c.req.header("Accept-Language")),
    clientSignal: c.req.raw.signal,
  });
  if (res.kind === "json") {
    return c.json(res.body, res.status as Parameters<typeof c.json>[1]);
  }
  c.header("Cache-Control", "no-cache");
  c.header("Content-Encoding", "Identity");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(
    c,
    async (stream) => {
      try {
        await res.write((data) =>
          stream.writeSSE({ data: JSON.stringify(data) }),
        );
      } catch (error) {
        console.error({ event: "chat_stream_failed", error });
      }
    },
  );
});

const completionsGuards = [
  requireAuth(bearerApiKeyMethod, apiKeyMethod, jwtMethod),
  chatThrottle,
  requireScope("chat_write"),
] as const;

const completionsRoute = createRoute({
  method: "post",
  path: "/api/v1/chat/completions",
  tags: ["Chat"],
  summary: "OpenAI-compatible chat completions",
  middleware: [...completionsGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: openAiCompletionBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(openAiCompletionResponseSchema),
    400: errorResponse("Bad request"),
  },
});
chatRoutes.openapi(completionsRoute, async (c) => {
  const res = await messageService.openAiChatCompletions(c.env, {
    userId: c.get("userId") ?? null,
    body: c.req.valid("json"),
    localeFallback: messageService.requestLocaleFromHeader(
      c.req.header("Accept-Language"),
    ),
  });
  return c.json(res.body, res.status as Parameters<typeof c.json>[1]);
});
