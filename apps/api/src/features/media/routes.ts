import { Hono } from "hono";
import { sessionMethod } from "../../middleware/auth";
import { toErrorBody } from "../../shared/errors";
import {
  clientIp,
  enforceThrottles,
  throttledResponse,
} from "../../lib/rate-limit";
import type { AppEnv } from "../../types/bindings";
import * as mediaService from "./service";

/**
 * Protected media streaming (`GET /api/media/*`).
 * Wildcard のため classic 登録。認可・Range 応答は service。
 */
export const mediaRoutes = new Hono<AppEnv>();

mediaRoutes.get("/*", async (c) => {
  const result = await sessionMethod(c);
  if (result.kind === "invalid") {
    return c.json(toErrorBody("UNAUTHORIZED", result.message), 401);
  }
  const shareSlug = result.kind === "ok"
    ? undefined
    : c.req.query("share_slug") || c.req.query("share_token");
  if (result.kind !== "ok" && !shareSlug) {
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  }
  if (result.kind === "ok") {
    c.set("userId", result.userId);
    c.set("authVia", result.via);
  }

  const path = mediaService.mediaPathFromUrl(new URL(c.req.url).pathname);
  const authz = await mediaService.authorizeMediaPath(c.env, path, {
    userId: c.var.userId,
    shareSlug,
  });
  if ("invalidShare" in authz) {
    // 存在するスラッグは 404、存在しないスラッグは 401 になるため、この経路は
    // 未認証で叩ける「スラッグ存在判定オラクル」になる。失敗した試行だけを
    // 絞ることで、正規の視聴者を巻き込まずに総当りのコストを上げる。
    const denied = await enforceThrottles(c.env, [
      { scope: "share_slug_probe_ip", ident: clientIp(c) },
    ]);
    if (denied) return throttledResponse(c, denied);
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  }
  if (shareSlug) {
    c.set("authVia", "share");
  }
  if ("notFound" in authz) return c.body(null, 404);

  try {
    const res = await mediaService.buildR2MediaResponse(
      c.env.VIDEO_BUCKET,
      authz.objectKey,
      path,
      c.req.header("Range"),
      c.req.raw.headers,
    );
    if (res) return res;
  } catch {
    /* fall through to signed URL */
  }

  const url = await mediaService.fallbackRedirectUrl(c.env, path);
  if (!url) return c.body(null, 404);
  return c.redirect(url, 302);
});
