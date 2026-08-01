import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/bindings";

/**
 * リクエスト ID を採番して c.set("requestId") とレスポンスヘッダに載せる。
 * 受信ヘッダ X-Request-Id があれば踏襲（フロント/上流のトレース連携）。
 */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = incoming ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});
