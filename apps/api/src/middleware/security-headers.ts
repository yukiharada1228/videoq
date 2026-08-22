import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/bindings";

/**
 * API レスポンス共通のセキュリティヘッダー。
 *
 * API は JSON だけでなく Scalar の API リファレンス（HTML）も返すため、
 * クリックジャッキングと MIME スニッフィングの両方を塞ぐ。
 * script-src 等のリソース系 CSP は Scalar のバンドル読み込みを壊すので
 * ここでは指定しない。frame-ancestors は自前リソースに影響しない。
 */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
});
