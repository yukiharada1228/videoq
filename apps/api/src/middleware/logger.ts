import { createMiddleware } from "hono/factory";
import { loggablePath } from "../shared/log-path";
import type { AppEnv } from "../types/bindings";

/**
 * 構造化アクセスログ（要件 §20.1）。Workers observability に載る JSON を 1 行出す。
 * トークン・個人情報はログに出さない（要件 SEC-9）。
 */
export const accessLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;
  console.log(
    JSON.stringify({
      level: "info",
      requestId: c.var.requestId,
      method: c.req.method,
      path: loggablePath(c.req.url),
      status: c.res.status,
      durationMs,
      env: c.env.ENVIRONMENT,
    }),
  );
});
