import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createR2MultipartUpload, completeR2MultipartUpload, abortR2MultipartUpload, getR2ObjectSize, deleteR2Object } from "../../src/integrations/media";

describe("R2 multipart binding", () => {
  it("completes parts and tolerates repeated aborts after completion", async () => {
    const production = { ...env, ENVIRONMENT: "production" };
    const key = `multipart-test/${crypto.randomUUID()}.mkv`;
    const uploadId = await createR2MultipartUpload(production, key, "video/matroska");
    const upload = env.VIDEO_BUCKET.resumeMultipartUpload(`media/${key}`, uploadId);
    try {
      expect(await getR2ObjectSize(production, key)).toBeNull();
      const first = await upload.uploadPart(1, new Uint8Array(5 * 1024 * 1024));
      const last = await upload.uploadPart(2, new Uint8Array([1, 2, 3]));
      await completeR2MultipartUpload(production, key, uploadId, [first, last]);
      expect(await getR2ObjectSize(production, key)).toBe(5 * 1024 * 1024 + 3);
      expect((await env.VIDEO_BUCKET.head(`media/${key}`))?.httpMetadata?.contentType).toBe("video/matroska");
      await abortR2MultipartUpload(production, key, uploadId);
      await abortR2MultipartUpload(production, key, uploadId);
      expect(await getR2ObjectSize(production, key)).toBe(5 * 1024 * 1024 + 3);
    } finally {
      await abortR2MultipartUpload(production, key, uploadId);
      await deleteR2Object(production, key);
    }
  });

  it("aborts partial data idempotently", async () => {
    const production = { ...env, ENVIRONMENT: "production" };
    const key = `multipart-test/${crypto.randomUUID()}.mkv`;
    const uploadId = await createR2MultipartUpload(production, key, "video/matroska");
    const upload = env.VIDEO_BUCKET.resumeMultipartUpload(`media/${key}`, uploadId);
    await upload.uploadPart(1, new Uint8Array([1]));
    await abortR2MultipartUpload(production, key, uploadId);
    await abortR2MultipartUpload(production, key, uploadId);
    expect(await getR2ObjectSize(production, key)).toBeNull();
    await expect(upload.complete([{ partNumber: 1, etag: "a".repeat(32) }])).rejects.toThrow();
  });
});
