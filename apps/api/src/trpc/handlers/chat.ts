import type { Context } from "hono";
import * as chatService from "../../features/chat/service";
import * as messageService from "../../features/chat/message-service";
import * as evaluationService from "../../features/evaluation/service";
import { clientIp, enforceThrottles } from "../../lib/rate-limit";
import type { AppEnv } from "../../types/bindings";
import { requireUserId, rpcError, type HandlersFor } from "./shared";

function statusCode(status: number) {
  if (status === 400) return "BAD_REQUEST" as const;
  if (status === 401) return "UNAUTHORIZED" as const;
  if (status === 403) return "FORBIDDEN" as const;
  if (status === 404) return "NOT_FOUND" as const;
  if (status === 409) return "CONFLICT" as const;
  if (status === 429) return "TOO_MANY_REQUESTS" as const;
  return "INTERNAL_SERVER_ERROR" as const;
}

function responseError(body: unknown): {
  message: string;
  code?: string;
  details?: unknown;
} {
  if (!body || typeof body !== "object") return { message: "Request failed" };
  const error = (body as Record<string, unknown>).error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : "Request failed",
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(record.details !== undefined ? { details: record.details } : {}),
    };
  }
  return { message: "Request failed" };
}

async function enforceChatThrottle(
  c: Context<AppEnv>,
  userId: string | null,
  shareSlug?: string,
) {
  const denied = await enforceThrottles(c.env, [
    { scope: "chat_authenticated", ident: userId },
    { scope: "chat_share_token_ip", ident: shareSlug ? clientIp(c) : null },
  ]);
  if (denied) {
    return rpcError(
      "TOO_MANY_REQUESTS",
      `Request was throttled. Expected available in ${denied.retryAfterSec} seconds.`,
      { appCode: "LIMIT_EXCEEDED" },
    );
  }
}

export function chatHandlers(
  c: Context<AppEnv>,
  authenticatedUserId: string | null,
): HandlersFor<"chat"> & HandlersFor<"evaluation"> {
  const userId = () => requireUserId(authenticatedUserId);
  return {
    "chat.send": async ({ messages, courseId, shareSlug, mode, studySessionId }) => {
      if (authenticatedUserId === null && !shareSlug) {
        return rpcError("UNAUTHORIZED", "Authentication credentials were not provided.", {
          appCode: "UNAUTHORIZED",
        });
      }
      await enforceChatThrottle(c, authenticatedUserId, shareSlug);
      const result = await messageService.sendChatMessage(c.env, {
        userId: authenticatedUserId,
        body: {
          messages,
          course_id: courseId,
          mode: mode ?? "qa",
          study_session_id: studySessionId,
        },
        shareSlug: shareSlug ?? null,
        locale: messageService.requestLocaleFromHeader(c.req.header("Accept-Language")),
      });
      if (result.status !== 200) {
        const error = responseError(result.body);
        return rpcError(statusCode(result.status), error.message, {
          appCode: error.code,
          details: error.details,
        });
      }
      return result.body;
    },
    "chat.feedback": async ({ chatLogId, feedback, shareSlug }) => {
      if (authenticatedUserId === null && !shareSlug) {
        return rpcError("UNAUTHORIZED", "Authentication credentials were not provided.");
      }
      const result = await chatService.submitFeedback(c.env, chatLogId, feedback, {
        userId: authenticatedUserId ?? undefined,
        shareSlug,
      });
      if ("notFound" in result) return rpcError("NOT_FOUND", result.notFound ?? "Not found");
      if ("forbidden" in result) return rpcError("FORBIDDEN", result.forbidden ?? "Forbidden");
      return { chat_log_id: result.chat_log_id, feedback: result.feedback };
    },
    "chat.history": async ({ courseId, limit, offset }) => {
      const result = await chatService.historyForCourse(c.env, courseId, userId(), limit, offset);
      if ("notFound" in result) return rpcError("NOT_FOUND", "Course not found.");
      return { data: result.results, meta: { total: result.count, limit, offset } };
    },
    "chat.resetHistory": async ({ courseId }) => {
      const result = await chatService.resetHistory(c.env, courseId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", "Course not found.");
      return { success: true };
    },
    "chat.analytics": async ({ courseId }) => {
      const result = await chatService.analyticsForCourse(c.env, courseId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", "Course not found.");
      return result;
    },
    "evaluation.summary": async ({ courseId }) => {
      const result = await evaluationService.summaryForCourse(c.env, courseId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", "Course not found");
      return result;
    },
    "evaluation.logs": async ({ courseId, limit, offset }) => {
      const result = await evaluationService.logsForCourse(c.env, courseId, userId(), limit, offset);
      if ("notFound" in result) return rpcError("NOT_FOUND", "Course not found");
      return {
        data: result.results,
        meta: { total: result.count, limit, offset },
      };
    },
  };
}
