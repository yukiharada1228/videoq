import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/bindings";

/**
 * CORS。許可オリジンは env（Pages 本番ドメイン）に限定し、credentials(Cookie) を許可
 * （要件 AU-12 / SEC-7）。env はミドルウェア実行時に参照するため関数で包む。
 */
export const corsMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const allowed = (c.env.CORS_ALLOW_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const handler = cors({
    // Comma-separated list in env (e.g. localhost + 127.0.0.1 for Vite).
    // Return the request origin only when allowlisted; otherwise omit ACAO.
    origin: (origin) => (origin && allowed.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["X-Request-Id"],
  });
  return handler(c, next);
});
