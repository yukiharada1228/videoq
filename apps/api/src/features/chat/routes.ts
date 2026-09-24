import type { Context } from "hono";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { streamSSE } from "hono/streaming";
import type { ZodError } from "zod";
import {
  requireAuth,
  sessionMethod,
} from "../../middleware/auth";
import { toErrorBody } from "../../shared/errors";
import { clientIp, enforceThrottles, throttledResponse } from "../../lib/rate-limit";
import type { AppEnv } from "../../types/bindings";
import { chatMessageBodySchema } from "./schemas";
import { limitChatRequestBody } from "./body-limit";
import * as chatService from "./service";
import * as messageService from "./message-service";

/** Raw transports only: CSV download and SSE. JSON chat operations use tRPC. */
export const chatRoutes = new Hono<AppEnv>();

const optionalShareAuth = createMiddleware<AppEnv>(async (c, next) => {
  const result = await sessionMethod(c);
  if (result.kind === "ok") {
    c.set("userId", result.userId);
    c.set("authVia", result.via);
    return next();
  }
  if (result.kind === "invalid") {
    return c.json(toErrorBody("UNAUTHORIZED", result.message), 401);
  }
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  if (shareSlug && await chatService.shareSlugExists(c.env, shareSlug)) {
    c.set("authVia", "share");
    return next();
  }
  return c.json(
    toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
    401,
  );
});

const chatThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  const denied = await enforceThrottles(c.env, [
    { scope: "chat_authenticated", ident: c.var.userId },
    { scope: "chat_share_token_ip", ident: shareSlug ? clientIp(c) : null },
  ]);
  if (denied) return throttledResponse(c, denied);
  await next();
});

const validationResponse = (c: Context<AppEnv>, message: string, error?: ZodError) => {
  const details: Record<string, string[]> = {};
  for (const issue of error?.issues ?? []) {
    const field = String(issue.path[0] ?? "body");
    (details[field] ??= []).push(issue.message);
  }
  return c.json(
    toErrorBody(
      "VALIDATION_ERROR",
      message,
      Object.keys(details).length > 0 ? details : undefined,
    ),
    400,
  );
};

chatRoutes.get(
  "/courses/:courseId/history.csv",
  requireAuth(sessionMethod),
  async (c) => {
    const courseId = Number(c.req.param("courseId"));
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return validationResponse(c, "courseId must be a positive integer");
    }
    const result = await chatService.exportHistoryCsv(c.env, courseId, c.var.userId!);
    if ("notFound" in result) {
      return c.json(toErrorBody("NOT_FOUND", "Course not found."), 404);
    }
    return c.body(result.body, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    });
  },
);

chatRoutes.post(
  "/messages/stream",
  limitChatRequestBody,
  optionalShareAuth,
  chatThrottle,
  async (c) => {
    const parsed = chatMessageBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return validationResponse(c, parsed.error.issues[0]?.message ?? "Invalid input", parsed.error);
    }
    const shareSlug = c.req.query("share_slug") ?? c.req.query("share_token") ?? null;
    const connection = new AbortController();
    const result = await messageService.streamChatMessage(c.env, {
      userId: c.var.userId ?? null,
      body: parsed.data,
      shareSlug,
      locale: messageService.requestLocaleFromHeader(c.req.header("Accept-Language")),
      clientSignal: AbortSignal.any([c.req.raw.signal, connection.signal]),
    });
    c.header("Cache-Control", "no-cache");
    c.header("Content-Encoding", "Identity");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      // 応答本文の cancel は Request.signal とは別。Hono の切断通知も上流へ渡す。
      stream.onAbort(() => connection.abort());
      try {
        await result.write((data) => stream.writeSSE({ data: JSON.stringify(data) }));
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "chat_stream_failed",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
  },
);
