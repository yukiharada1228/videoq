import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { verifyDjangoCsrfToken } from "../utils/csrf";
import type { AppEnv } from "../types/bindings";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Origin/Referer チェック（Django CsrfViewMiddleware 相当・簡略）。
 * - Origin があれば request の origin か trusted origins と一致必須。
 * - Origin が無く HTTPS なら Referer（絶対 https URL, host が一致/trusted）必須。
 */
function verifyOriginOrReferer(c: {
  req: { url: string; header: (n: string) => string | undefined };
  env: AppEnv["Bindings"];
}): boolean {
  const reqUrl = new URL(c.req.url);
  const trusted = new Set(
    (c.env.CORS_ALLOW_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );

  const origin = c.req.header("Origin");
  if (origin) {
    return origin === reqUrl.origin || trusted.has(origin);
  }

  // Origin 無し: HTTP は許容（Django も HTTPS のみ Referer 必須）
  if (reqUrl.protocol !== "https:") return true;

  const referer = c.req.header("Referer");
  if (!referer) return false;
  let ref: URL;
  try {
    ref = new URL(referer);
  } catch {
    return false;
  }
  if (ref.protocol !== "https:") return false;
  return ref.host === reqUrl.host || trusted.has(ref.origin);
}

/**
 * CSRF 保護（CookieJWTAuthentication.enforce_csrf 相当）。
 * **Cookie 認証 かつ 非安全メソッド のときだけ**適用（Bearer/APIキーは対象外）。
 * requireAuth の後に配置する（authVia を参照するため）。
 */
export const csrfProtect = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("authVia") === "cookie" && !SAFE_METHODS.has(c.req.method)) {
    const originOk = verifyOriginOrReferer({ req: c.req, env: c.env });
    const tokenOk = verifyDjangoCsrfToken(
      getCookie(c, "csrftoken"),
      c.req.header("X-CSRFToken"),
    );
    if (!originOk || !tokenOk) {
      return c.json({ detail: "CSRF Failed: verification failed." }, 403);
    }
  }
  await next();
});
