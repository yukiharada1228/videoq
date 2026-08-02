import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { apiKeyMethod, jwtMethod } from "../middleware/auth";
import { resolveFileUrl } from "../integrations/media";
import {
  isSafeMediaPath,
  findVideoIdByFilePath,
  isVideoOwnedByUser,
  isVideoInGroup,
  resolveShareSlugGroupId,
} from "../repositories/media-repository";
import type { AppEnv } from "../types/bindings";

/**
 * Django `ProtectedMediaView`（`GET /api/media/<path>`）。
 * 認証: API キー → JWT → share_slug。認可後に R2 をストリーム、無ければ署名 GET へ 302。
 */
export const mediaRoutes = new Hono<AppEnv>();

const guessContentType = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".srt")) return "application/x-subrip";
  if (lower.endsWith(".vtt")) return "text/vtt";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
};

/** APIKey → JWT → share_slug（Django authentication_classes 順）。 */
const mediaAuth = createMiddleware<AppEnv>(async (c, next) => {
  for (const method of [apiKeyMethod, jwtMethod]) {
    const r = await method(c);
    if (r.kind === "ok") {
      c.set("userId", r.userId);
      c.set("authVia", r.via);
      if (r.accessLevel) c.set("apiKeyAccessLevel", r.accessLevel);
      return next();
    }
    if (r.kind === "invalid") return c.json({ detail: r.message }, 401);
  }
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  if (shareSlug) {
    const groupId = await resolveShareSlugGroupId(c.env, shareSlug);
    if (groupId !== null) {
      c.set("authVia", "share");
      c.set("shareSlug", shareSlug);
      c.set("shareGroupId", groupId);
      return next();
    }
  }
  return c.json(
    { detail: "Authentication credentials were not provided." },
    401,
  );
});

const serveMedia = async (c: Context<AppEnv>) => {
  const full = new URL(c.req.url).pathname;
  const prefix = "/api/media/";
  const path = decodeURIComponent(
    full.startsWith(prefix) ? full.slice(prefix.length) : "",
  ).replace(/^\/+/, "");

  if (!isSafeMediaPath(path)) return c.body(null, 404);

  const videoId = await findVideoIdByFilePath(c.env, path);
  if (videoId === null) return c.body(null, 404);

  const shareGroupId = c.get("shareGroupId");
  const userId = c.get("userId");
  if (shareGroupId != null) {
    if (!(await isVideoInGroup(c.env, videoId, shareGroupId))) {
      return c.body(null, 404);
    }
  } else if (userId != null) {
    if (!(await isVideoOwnedByUser(c.env, videoId, userId))) {
      return c.body(null, 404);
    }
  } else {
    return c.body(null, 404);
  }

  const objectKey = `media/${path}`;
  const rangeHeader = c.req.header("Range");
  try {
    const obj = await c.env.VIDEO_BUCKET.get(
      objectKey,
      rangeHeader ? { range: c.req.raw.headers } : undefined,
    );
    if (obj) {
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("etag", obj.httpEtag);
      if (!headers.has("content-type")) {
        headers.set("Content-Type", guessContentType(path));
      }
      headers.set("Accept-Ranges", "bytes");
      // R2 range 応答は GetResult に range プロパティが付く
      const hasRange = "range" in obj && obj.range != null;
      return new Response(obj.body, {
        status: hasRange ? 206 : 200,
        headers,
      });
    }
  } catch {
    /* fall through */
  }

  try {
    const url = await resolveFileUrl(c.env, path);
    if (!url) return c.body(null, 404);
    return c.redirect(url, 302);
  } catch {
    return c.body(null, 404);
  }
};

mediaRoutes.get("/api/media/*", mediaAuth, serveMedia);
