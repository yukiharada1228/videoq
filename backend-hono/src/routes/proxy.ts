import type { Context } from "hono";
import type { AppEnv } from "../types/bindings";

/**
 * ストラングラーフィグのプロキシ（要件 §12 / Phase 3）。
 * 未移行ルートを LEGACY_API_ORIGIN（既存 Django: CloudFront→API Gateway）へ透過する。
 *
 * - メソッド / パス / クエリ / ボディ / ヘッダ（Cookie・Authorization・CSRF 含む）を転送。
 * - レスポンスは Set-Cookie 等ヘッダごとそのまま返す（認証 Cookie を壊さない）。
 * - 大きなボディはバッファせずストリームで中継（duplex: "half"）。
 * - リダイレクトは透過（フロントに委ねる）。
 */
export async function proxyToLegacy(c: Context<AppEnv>): Promise<Response> {
  const origin = c.env.LEGACY_API_ORIGIN;
  const incoming = c.req.raw;
  const url = new URL(incoming.url);
  const target = origin.replace(/\/$/, "") + url.pathname + url.search;

  const headers = new Headers(incoming.headers);
  headers.delete("host"); // fetch が upstream の Host を設定する
  headers.set("X-Request-Id", c.get("requestId"));
  headers.set("X-Forwarded-Host", url.host);

  const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: incoming.method,
    headers,
    body: hasBody ? incoming.body : undefined,
    redirect: "manual",
  };
  if (hasBody) init.duplex = "half"; // ストリームボディ送信に必須

  const upstream = await fetch(target, init);

  // ステータス・ヘッダ（Set-Cookie 含む）・ボディをそのまま透過
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
