import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types/bindings";

/**
 * クライアントが実際に使ったスキームが平文 HTTP か。Cloudflare が全リクエストに
 * 付与する CF-Visitor（例: {"scheme":"http"}）で判定する。request.url は TLS
 * 終端後に https 化され得るため、平文判定にはこのヘッダが確実。ローカル/テストは
 * このヘッダを付けないので、HTTPS 強制は発火しない。
 */
function clientUsedPlaintextHttp(c: Context<AppEnv>): boolean {
  const header = c.req.header("CF-Visitor");
  if (!header) return false;
  try {
    return (JSON.parse(header) as { scheme?: unknown }).scheme === "http";
  } catch {
    return false;
  }
}

/**
 * API レスポンス共通のセキュリティヘッダー。
 *
 * JSON、SSE、binary response に共通する防御を適用する。
 * API 自体は HTML を返さないため frame 埋め込みを禁止する。
 *
 * また、平文 HTTP で到達したリクエストは HTTPS へ 301 し、HTTPS 応答には
 * HSTS を付与する。Cloudflare の "Always Use HTTPS" に依存せず、Worker 単体で
 * SSL ストリッピングを塞ぐ（HSTS は HTTPS 応答でのみブラウザに記録される）。
 */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  // 本番で平文 HTTP に届いたら HTTPS へ 301。
  if (c.env.ENVIRONMENT === "production" && clientUsedPlaintextHttp(c)) {
    const url = new URL(c.req.url);
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // 本番(HTTPS)応答にのみ HSTS。dev は http://localhost を使うため付与しない。
  if (c.env.ENVIRONMENT === "production") {
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
});
