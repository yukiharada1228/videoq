import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types/bindings";

/**
 * メディア共通基盤。
 * - USE_S3_STORAGE=true: django-storages 互換の R2 presigned GET/PUT（aws4fetch SigV4）
 * - USE_S3_STORAGE=false: ローカル VIDEO_BUCKET + `/api/media/`（Django MEDIA_URL 相当）
 *
 * オブジェクトキー = `media/<file_key>`（location プレフィックスを Worker 側で1回付与）。
 */

/** Django `USE_S3_STORAGE` 相当（`"true"` のときのみ R2 署名）。 */
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

async function presignR2Get(env: Bindings, fileKey: string): Promise<string> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_S3_ENDPOINT || !env.R2_BUCKET_NAME) {
    throw new Error("R2 presign secrets are not configured");
  }
  const signer = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
  });

  const normalizedKey = fileKey.replace(/\\/g, "/").replace(/^\/+/, "");
  const encodedPath = [env.R2_BUCKET_NAME, "media", ...normalizedKey.split("/")]
    .map(encodeRfc3986Segment)
    .join("/");
  const endpoint = env.R2_S3_ENDPOINT.replace(/\/+$/, "");

  const url = new URL(`${endpoint}/${encodedPath}`);
  url.searchParams.set("X-Amz-Expires", "3600"); // aws4fetch は expires 無し（既定86400）→ 明示

  const signed = await signer.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Django `_resolve_file_url` と同じ分岐。
 * 空→null / http(s)→そのまま /
 * USE_S3 → R2 presigned / それ以外 → `/api/media/{key}`（相対。FE が絶対化）。
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
  return presignR2Get(env, fileKey);
}

/** R2 のオブジェクトキー（django-storages location="media" と一致）。 */
function r2ObjectKey(fileKey: string): string {
  const normalized = fileKey.replace(/\\/g, "/").replace(/^\/+/, "");
  return `media/${normalized}`;
}

/**
 * アップロード用 presigned PUT URL（boto3 generate_presigned_url("put_object", ContentType=...) 相当）。
 * ContentType を署名ヘッダに含める（SignedHeaders=content-type;host）。クライアントは
 * PUT 時に同じ Content-Type を送る必要がある。expire 3600、path-style、region=auto。
 */
export async function presignR2Put(
  env: Bindings,
  fileKey: string,
  contentType: string,
): Promise<string> {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_S3_ENDPOINT || !env.R2_BUCKET_NAME) {
    throw new Error("R2 presign secrets are not configured");
  }
  const signer = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
  });

  const normalizedKey = fileKey.replace(/\\/g, "/").replace(/^\/+/, "");
  const encodedPath = [env.R2_BUCKET_NAME, "media", ...normalizedKey.split("/")]
    .map(encodeRfc3986Segment)
    .join("/");
  const endpoint = env.R2_S3_ENDPOINT.replace(/\/+$/, "");

  const url = new URL(`${endpoint}/${encodedPath}`);
  url.searchParams.set("X-Amz-Expires", "3600");

  const signed = await signer.sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType } }),
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

/**
 * R2 オブジェクトのサイズ（bytes）を取得（get_file_size 相当）。
 * 見つからなければ null。VIDEO_BUCKET(ネイティブ R2 API)を使う。
 */
export async function getR2ObjectSize(
  env: Bindings,
  fileKey: string,
): Promise<number | null> {
  const obj = await env.VIDEO_BUCKET.head(r2ObjectKey(fileKey));
  return obj ? obj.size : null;
}

/** R2 オブジェクトを削除（default_storage.delete 相当）。 */
export async function deleteR2Object(env: Bindings, fileKey: string): Promise<void> {
  await env.VIDEO_BUCKET.delete(r2ObjectKey(fileKey));
}

/** ローカル / R2 バインディングへオブジェクトを保存（multipart アップロード用）。 */
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
