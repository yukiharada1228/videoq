import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/bindings";

/**
 * CORS。許可オリジンは env（Pages 本番ドメイン）に限定し、credentials(Cookie) を許可
 * （要件 AU-12 / SEC-7）。env はミドルウェア実行時に参照するため関数で包む。
 */
export const corsMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const handler = cors({
    origin: c.env.CORS_ALLOW_ORIGIN,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-CSRFToken", "X-API-Key"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["X-Request-Id"],
  });
  return handler(c, next);
});
