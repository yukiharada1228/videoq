import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types/bindings";
import { deadlineSignal } from "../lib/request-timeout";

const S3_OPERATION_TIMEOUT_MS = 10_000;

/**
 * メディア共通基盤。
 * - USE_S3_STORAGE=true: S3 互換（本番 R2 / ローカル MinIO）の presigned GET/PUT + Head/Delete
 * - USE_S3_STORAGE=false: VIDEO_BUCKET + `/api/media/`（multipart）
 *
 * オブジェクトキーは `media/<file_key>`。
 */

/** `"true"` のときのみ S3 API で署名する。 */
export function isS3Storage(env: Bindings): boolean {
  return (env.USE_S3_STORAGE ?? "").toLowerCase() === "true";
}

// RFC3986: encodeURIComponent が残す ! ' ( ) * も % エンコードする。
function encodeRfc3986Segment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function requireS3Config(
  env: Bindings,
  opts: { /** false → Head/Delete 用（compose 内は minio:9000 など） */ public?: boolean } = {},
): {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  region: string;
} {
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const publicEndpoint = env.R2_S3_ENDPOINT;
  const bucket = env.R2_BUCKET_NAME;
  if (!accessKeyId || !secretAccessKey || !publicEndpoint || !bucket) {
    throw new Error("S3/R2 credentials are not configured (R2_* / MinIO)");
  }
  // 署名 URL はブラウザ到達可能な公開 endpoint。サーバー側 ops は INTERNAL があればそちら。
  const usePublic = opts.public !== false;
  const endpoint = (
    usePublic
      ? publicEndpoint
      : env.R2_S3_INTERNAL_ENDPOINT || publicEndpoint
  ).replace(/\/+$/, "");
  // R2 は "auto"。MinIO / AWS S3 は実リージョン（ローカル MinIO は us-east-1）。
  const region = (env.R2_S3_REGION || env.AWS_REGION || "auto").trim() || "auto";
  return {
    accessKeyId,
    secretAccessKey,
    endpoint,
    bucket,
    region,
  };
}

function s3Client(
  env: Bindings,
  opts: { public?: boolean } = {},
): { aws: AwsClient; endpoint: string; bucket: string } {
  const cfg = requireS3Config(env, opts);
  return {
    aws: new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: "s3",
    }),
    endpoint: cfg.endpoint,
    bucket: cfg.bucket,
  };
}

/** Path-style object URL: {endpoint}/{bucket}/media/{key} */
function objectUrl(endpoint: string, bucket: string, fileKey: string): URL {
  const normalizedKey = fileKey.replace(/\\/g, "/").replace(/^\/+/, "");
  const encodedPath = [bucket, "media", ...normalizedKey.split("/")]
    .map(encodeRfc3986Segment)
    .join("/");
  return new URL(`${endpoint}/${encodedPath}`);
}

async function presignR2Get(env: Bindings, fileKey: string): Promise<string> {
  const { aws, endpoint, bucket } = s3Client(env);
  const url = objectUrl(endpoint, bucket, fileKey);
  url.searchParams.set("X-Amz-Expires", "3600");
  const signed = await aws.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * 設定に応じて署名 URL または API 配信 URL を返す。
 * 空→null / http(s)→そのまま /
 * USE_S3 → S3 presigned / それ以外 → `/api/media/{key}`（相対。FE が絶対化）。
 */
export async function resolveFileUrl(
  env: Bindings,
  fileKey: string | null,
): Promise<string | null> {
  if (!fileKey) return null;
  if (fileKey.startsWith("http://") || fileKey.startsWith("https://")) {
    return fileKey;
  }
  if (!isS3Storage(env)) {
    return `/api/media/${fileKey.replace(/^\/+/, "")}`;
  }
  try {
    return await presignR2Get(env, fileKey);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        error: "resolveFileUrl failed",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
    return null;
  }
}

/** R2 / MinIO の `media/` 配下に置くオブジェクトキー。 */
function r2ObjectKey(fileKey: string): string {
  const normalized = fileKey.replace(/\\/g, "/").replace(/^\/+/, "");
  return `media/${normalized}`;
}

/**
 * アップロード用 presigned PUT URL。
 * Content-Type と Content-Length を署名ヘッダに含める。
 * クライアントは申告したファイルそのものを PUT しなければ署名検証に失敗する。
 */
export async function presignR2Put(
  env: Bindings,
  fileKey: string,
  contentType: string,
  contentLength: number,
): Promise<string> {
  const { aws, endpoint, bucket } = s3Client(env);
  const url = objectUrl(endpoint, bucket, fileKey);
  url.searchParams.set("X-Amz-Expires", "3600");
  const signed = await aws.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "content-length": String(contentLength),
        "content-type": contentType,
      },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

/**
 * オブジェクトサイズ（bytes）。USE_S3 時は S3 HeadObject、それ以外は VIDEO_BUCKET.head。
 */
export async function getR2ObjectSize(
  env: Bindings,
  fileKey: string,
): Promise<number | null> {
  // Production Workers can reach R2 directly through the binding. Keep the
  // signed HTTP path only for local MinIO, where the binding is not the source
  // of truth used by presigned browser uploads.
  if (env.ENVIRONMENT === "production") {
    const obj = await env.VIDEO_BUCKET.head(r2ObjectKey(fileKey));
    return obj ? obj.size : null;
  }
  if (isS3Storage(env)) {
    const { aws, endpoint, bucket } = s3Client(env, { public: false });
    const url = objectUrl(endpoint, bucket, fileKey);
    const signed = await aws.sign(new Request(url, { method: "HEAD" }));
    const res = await fetch(signed, {
      signal: deadlineSignal(S3_OPERATION_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`S3 HeadObject failed: ${res.status}`);
    }
    const len = res.headers.get("content-length");
    return len != null ? Number(len) : null;
  }
  const obj = await env.VIDEO_BUCKET.head(r2ObjectKey(fileKey));
  return obj ? obj.size : null;
}

/** オブジェクト削除。USE_S3 時は S3 DeleteObject。 */
export async function deleteR2Object(env: Bindings, fileKey: string): Promise<void> {
  if (env.ENVIRONMENT === "production") {
    await env.VIDEO_BUCKET.delete(r2ObjectKey(fileKey));
    return;
  }
  if (isS3Storage(env)) {
    const { aws, endpoint, bucket } = s3Client(env, { public: false });
    const url = objectUrl(endpoint, bucket, fileKey);
    const signed = await aws.sign(new Request(url, { method: "DELETE" }));
    const res = await fetch(signed, {
      signal: deadlineSignal(S3_OPERATION_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 DeleteObject failed: ${res.status}`);
    }
    return;
  }
  await env.VIDEO_BUCKET.delete(r2ObjectKey(fileKey));
}

/** Server-only bounded reads. Never forward object URLs/credentials to a model. */
export async function readMediaBytes(
  env: Bindings, fileKey: string, maxBytes: number, signal?: AbortSignal,
): Promise<Uint8Array | null> {
  signal?.throwIfAborted();
  let body: ReadableStream<Uint8Array>;
  let size: number;
  if (env.ENVIRONMENT === "production" || !isS3Storage(env)) {
    const object = await env.VIDEO_BUCKET.get(r2ObjectKey(fileKey));
    if (!object) return null;
    body = object.body;
    size = object.size;
  } else {
    const { aws, endpoint, bucket } = s3Client(env, { public: false });
    const signed = await aws.sign(new Request(objectUrl(endpoint, bucket, fileKey)));
    const response = await fetch(signed, { signal: deadlineSignal(S3_OPERATION_TIMEOUT_MS, signal) });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`S3 GetObject failed: ${response.status}`);
    }
    body = response.body;
    size = Number(response.headers.get("content-length") ?? 0);
  }
  if (size > maxBytes) {
    await body.cancel();
    throw new Error("Media object exceeds the read limit");
  }
  return readBoundedBody(body, maxBytes, signal);
}

/** Exact, version-pinned ranges for dense frame packs. Never fetch the full pack. */
export async function readMediaRange(
  env: Bindings, fileKey: string, offset: number, length: number,
  signal?: AbortSignal, etag?: string,
): Promise<{ bytes: Uint8Array; etag: string; size: number } | null> {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length)
    || length <= 0 || length > 4 * 1024 * 1024 || !Number.isSafeInteger(offset + length)) {
    throw new Error("Invalid media range");
  }
  const requestSignal = deadlineSignal(S3_OPERATION_TIMEOUT_MS, signal);
  requestSignal.throwIfAborted();
  let body: ReadableStream<Uint8Array>;
  let size: number;
  let currentEtag: string;
  let validRange: boolean;
  if (env.ENVIRONMENT === "production" || !isS3Storage(env)) {
    const onlyIf = new Headers(etag ? { "if-match": etag } : {});
    const object = await env.VIDEO_BUCKET.get(r2ObjectKey(fileKey), { range: { offset, length }, onlyIf });
    if (!object || !("body" in object)) return null;
    body = object.body;
    size = object.size;
    currentEtag = object.httpEtag;
    validRange = !!object.range && "offset" in object.range
      && object.range.offset === offset && object.range.length === length;
  } else {
    const { aws, endpoint, bucket } = s3Client(env, { public: false });
    const headers = new Headers({ Range: `bytes=${offset}-${offset + length - 1}` });
    if (etag) headers.set("If-Match", etag);
    const signed = await aws.sign(new Request(objectUrl(endpoint, bucket, fileKey), { headers }));
    const response = await fetch(signed, { signal: requestSignal });
    if (response.status === 404 || response.status === 412) { await response.body?.cancel(); return null; }
    if (response.status !== 206 || !response.body) {
      await response.body?.cancel();
      throw new Error(`S3 ranged GetObject failed: ${response.status}`);
    }
    body = response.body;
    currentEtag = response.headers.get("etag") ?? "";
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    size = match ? Number(match[3]) : NaN;
    validRange = !!match && Number(match[1]) === offset && Number(match[2]) === offset + length - 1;
  }
  if (!validRange || !Number.isSafeInteger(size) || size < offset + length || !currentEtag || (etag && etag !== currentEtag)) {
    await body.cancel();
    throw new Error("Invalid or changed media range");
  }
  const bytes = await readBoundedBody(body, length, requestSignal);
  if (bytes.length !== length) throw new Error("Incomplete media range");
  return { bytes, etag: currentEtag, size };
}

async function readBoundedBody(body: ReadableStream<Uint8Array>, maxBytes: number, signal?: AbortSignal) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Media object exceeds the read limit");
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** ローカル VIDEO_BUCKET へ保存（multipart / USE_S3=false 用）。 */
export async function putMediaObject(
  env: Bindings,
  fileKey: string,
  body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
  contentType: string,
): Promise<void> {
  await env.VIDEO_BUCKET.put(r2ObjectKey(fileKey), body, {
    httpMetadata: { contentType },
  });
}
