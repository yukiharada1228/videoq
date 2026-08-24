import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { apiKeyMethod, sessionMethod } from "../../middleware/auth";
import { createFeatureRouter } from "../../shared/openapi";
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
export const mediaRoutes = createFeatureRouter();

const mediaAuth = createMiddleware<AppEnv>(async (c, next) => {
  for (const method of [apiKeyMethod, sessionMethod]) {
    const r = await method(c);
    if (r.kind === "ok") {
      c.set("userId", r.userId);
      c.set("authVia", r.via);
      if (r.accessLevel) c.set("apiKeyAccessLevel", r.accessLevel);
      return next();
    }
    if (r.kind === "invalid")
      return c.json(toErrorBody("UNAUTHORIZED", r.message), 401);
  }
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  if (shareSlug) {
    const courseId = await mediaService.resolveShareSlugCourseId(c.env, shareSlug);
    if (courseId !== null) {
      c.set("authVia", "share");
      c.set("shareSlug", shareSlug);
      c.set("shareCourseId", courseId);
      return next();
    }
    // 存在するスラッグは 404、存在しないスラッグは 401 になるため、この経路は
    // 未認証で叩ける「スラッグ存在判定オラクル」になる。失敗した試行だけを
    // 絞ることで、正規の視聴者を巻き込まずに総当りのコストを上げる。
    const denied = await enforceThrottles(c.env, [
      { scope: "share_slug_probe_ip", ident: clientIp(c) },
    ]);
    if (denied) return throttledResponse(c, denied);
  }
  return c.json(
    toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
    401,
  );
});

const serveMedia = async (c: Context<AppEnv>) => {
  const path = mediaService.mediaPathFromUrl(new URL(c.req.url).pathname);
  const authz = await mediaService.authorizeMediaPath(c.env, path, {
    userId: c.var.userId,
    shareCourseId: c.var.shareCourseId,
  });
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
};

mediaRoutes.get("/*", mediaAuth, serveMedia);
