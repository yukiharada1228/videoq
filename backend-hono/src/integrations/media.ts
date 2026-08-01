import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types/bindings";

/**
 * メディア（R2）共通基盤。Django `_resolve_file_url` / django-storages(S3Boto3Storage,
 * location="media", querystring_auth, s3v4, expire 3600) と構造一致する presigned GET URL を
 * aws4fetch(SigV4) で生成する（codex 検証済みの仕様）。
 *
 * 本番の R2 object key = `media/<file_key>`（location プレフィックスを Worker 側で1回付与）。
 * region は Django と合わせ "auto"、path-style 固定、custom domain では署名しない。
 */

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
 * 空→null / http(s)→そのまま / それ以外→R2 presigned（本番 USE_S3 相当）。
 */
export async function resolveFileUrl(
  env: Bindings,
  fileKey: string | null,
): Promise<string | null> {
  if (!fileKey) return null;
  if (fileKey.startsWith("http://") || fileKey.startsWith("https://")) {
    return fileKey;
  }
  return presignR2Get(env, fileKey);
}
