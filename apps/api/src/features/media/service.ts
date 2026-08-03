import { isS3Storage, resolveFileUrl } from "../../integrations/media";
import {
  isSafeMediaPath,
  findVideoIdByFilePath,
  isVideoOwnedByUser,
  isVideoInGroup,
  resolveShareSlugGroupId as repositoryResolveShareSlugGroupId,
} from "../../repositories/media-repository";
import type { Bindings } from "../../types/bindings";

export function resolveShareSlugGroupId(env: Bindings, shareSlug: string) {
  return repositoryResolveShareSlugGroupId(env, shareSlug);
}

export function guessContentType(path: string): string {
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
}

export async function authorizeMediaPath(
  env: Bindings,
  path: string,
  opts: { userId?: number; shareGroupId?: number },
): Promise<{ ok: true; objectKey: string } | { notFound: true }> {
  if (!isSafeMediaPath(path)) return { notFound: true };
  const videoId = await findVideoIdByFilePath(env, path);
  if (videoId === null) return { notFound: true };

  if (opts.shareGroupId != null) {
    if (!(await isVideoInGroup(env, videoId, opts.shareGroupId))) {
      return { notFound: true };
    }
  } else if (opts.userId != null) {
    if (!(await isVideoOwnedByUser(env, videoId, opts.userId))) {
      return { notFound: true };
    }
  } else {
    return { notFound: true };
  }

  return { ok: true, objectKey: `media/${path}` };
}

export async function fallbackRedirectUrl(
  env: Bindings,
  path: string,
): Promise<string | null> {
  if (!isS3Storage(env)) return null;
  try {
    const url = await resolveFileUrl(env, path);
    if (!url || url.startsWith("/")) return null;
    return url;
  } catch {
    return null;
  }
}

type R2Range =
  | { offset: number; length: number }
  | { offset: number }
  | { suffix: number };

/** R2 object → 200/206 Response。オブジェクト無しは null。 */
export async function buildR2MediaResponse(
  bucket: R2Bucket,
  objectKey: string,
  path: string,
  rangeHeader: string | undefined,
  rawHeaders: Headers,
): Promise<Response | null> {
  const obj = await bucket.get(
    objectKey,
    rangeHeader ? { range: rawHeaders } : undefined,
  );
  if (!obj) return null;

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  if (!headers.has("content-type")) {
    headers.set("Content-Type", guessContentType(path));
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=0");

  const total = obj.size;
  const ranged = "range" in obj ? (obj.range as R2Range | undefined) : undefined;
  if (ranged && total != null) {
    let start = 0;
    let end = total - 1;
    if ("suffix" in ranged) {
      start = Math.max(0, total - ranged.suffix);
    } else {
      start = ranged.offset;
      if ("length" in ranged && ranged.length != null) {
        end = Math.min(total - 1, start + Number(ranged.length) - 1);
      }
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }

  if (total != null) headers.set("Content-Length", String(total));
  return new Response(obj.body, { status: 200, headers });
}

export function mediaPathFromUrl(pathname: string): string {
  const prefix = "/api/media/";
  // createApp 経由は `/api/media/...`、feature 単体テストはマウント後の相対 path。
  const raw = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname.replace(/^\/+/, "");
  return decodeURIComponent(raw).replace(/^\/+/, "");
}
