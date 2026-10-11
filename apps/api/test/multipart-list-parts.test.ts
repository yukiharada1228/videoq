import { afterEach, describe, expect, it, vi } from "vitest";
import { listR2MultipartParts } from "../src/integrations/media";
import type { Bindings } from "../src/types/bindings";

const env = { R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret",
  R2_S3_ENDPOINT: "https://storage.example", R2_BUCKET_NAME: "test", R2_S3_REGION: "auto" } as Bindings;
const part = (number: number, etag = '&quot;' + 'a'.repeat(32) + '&quot;') =>
  `<Part><PartNumber>${number}</PartNumber><LastModified>2026-10-11</LastModified><ETag>${etag}</ETag><Size>67108864</Size></Part>`;
afterEach(() => vi.unstubAllGlobals());

describe("bounded S3 ListParts", () => {
  it("signs and paginates the R2 S3 request with exact part sizes", async () => {
    const fetch = vi.fn(async () => new Response(`<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${part(101)}<IsTruncated>true</IsTruncated><NextPartNumberMarker>101</NextPartNumberMarker></ListPartsResult>`));
    vi.stubGlobal("fetch", fetch);
    expect(await listR2MultipartParts(env, "videos/owner/video.mkv", "upload-session", 100)).toEqual({
      parts: [{ partNumber: 101, etag: "a".repeat(32), size: 67108864 }], next_marker: 101,
    });
    const request = fetch.mock.calls[0][0] as Request;
    expect(request.method).toBe("GET");
    expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(new URL(request.url).searchParams.get("max-parts")).toBe("100");
    expect(new URL(request.url).searchParams.get("part-number-marker")).toBe("100");
  });
  it.each([
    `<ListPartsResult>${part(1)}<IsTruncated>true</IsTruncated><NextPartNumberMarker>0</NextPartNumberMarker></ListPartsResult>`,
    `<ListPartsResult>${part(2)}${part(1)}</ListPartsResult>`,
    `<ListPartsResult>${part(1, 'invalid')}</ListPartsResult>`,
    `<ListPartsResult>${' '.repeat(65536)}</ListPartsResult>`,
    `<Error><Code>NoSuchUpload</Code></Error>`,
  ])("rejects malformed, unbounded or embedded error responses", async xml => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml)));
    await expect(listR2MultipartParts(env, "file.mkv", "upload", 0)).rejects.toThrow();
  });
});
