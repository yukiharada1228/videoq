import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError } from "../utils/errors";
import { err } from "../utils/responses";
import type { AppEnv } from "../types/bindings";

/**
 * app.onError に渡す共通ハンドラ。AppError / HTTPException を統一封筒へ変換し、
 * 想定外例外は 500 + 汎用メッセージ（内部詳細は漏らさない, SEC-8）。詳細はログへ。
 */
export function onError(e: Error, c: Context<AppEnv>): Response {
  if (e instanceof AppError) {
    return err(c, e.status, e.code, e.expose ? e.message : "Request failed");
  }
  if (e instanceof HTTPException) {
    return err(c, e.status, "http_exception", e.message || "Request failed");
  }
  console.error(
    JSON.stringify({
      level: "error",
      requestId: c.get("requestId"),
      path: new URL(c.req.url).pathname,
      error: e?.message ?? String(e),
      stack: e?.stack,
    }),
  );
  return err(c, 500, "internal_error", "Internal Server Error");
}
