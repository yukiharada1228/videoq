import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types/bindings";

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
  if (isS3Storage(env)) {
    const { aws, endpoint, bucket } = s3Client(env, { public: false });
    const url = objectUrl(endpoint, bucket, fileKey);
    const signed = await aws.sign(new Request(url, { method: "HEAD" }));
    const res = await fetch(signed);
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
  if (isS3Storage(env)) {
    const { aws, endpoint, bucket } = s3Client(env, { public: false });
    const url = objectUrl(endpoint, bucket, fileKey);
    const signed = await aws.sign(new Request(url, { method: "DELETE" }));
    const res = await fetch(signed);
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 DeleteObject failed: ${res.status}`);
    }
    return;
  }
  await env.VIDEO_BUCKET.delete(r2ObjectKey(fileKey));
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
