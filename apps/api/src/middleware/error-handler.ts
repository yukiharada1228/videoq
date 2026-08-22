import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApiError, toErrorBody } from "../shared/errors";
import { loggablePath } from "../shared/log-path";
import type { AppEnv } from "../types/bindings";

/**
 * app.onError に渡す共通ハンドラ。
 * 契約: `{ error: { code, message, details? } }`（SEC-8: 内部詳細は漏らさない）。
 */
export function onError(e: Error, c: Context<AppEnv>): Response {
  if (e instanceof ApiError) {
    return c.json(
      toErrorBody(
        e.code,
        e.expose ? e.message : "Request failed",
        e.details,
      ),
      e.status,
    );
  }

  if (e instanceof HTTPException) {
    // MCP / OAuth 等、規格固有の Response を載せた HTTPException はそのまま返す。
    if (e.res) return e.getResponse();

    const status = e.status;
    const code =
      status === 404
        ? "NOT_FOUND"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : "HTTP_EXCEPTION";
    return c.json(
      toErrorBody(code, e.message || "Request failed"),
      status,
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      requestId: c.var.requestId,
      path: loggablePath(c.req.url),
      error: e?.message ?? String(e),
      stack: e?.stack,
    }),
  );

  return c.json(toErrorBody("INTERNAL_ERROR", "Internal Server Error"), 500);
}
